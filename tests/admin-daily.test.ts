import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {report,snapshot,testDatabase} from './helpers/data-fixtures';

test('manual report dates reject invalid dates and allow future windows without shifting the requested day', async () => {
 const {parseDailyReportDate} = await import('../src/lib/daily-window');
 for(const value of [undefined,'2026-02-30','2026-11-12; rm -rf /'])
  assert.throws(()=>parseDailyReportDate(value),/日期/);
 assert.equal(parseDailyReportDate('2026-11-12').toISOString(),'2026-11-12T18:00:00.000Z');
 assert.equal(parseDailyReportDate('2099-11-13').toISOString(),'2099-11-13T18:00:00.000Z');
});

test('daily admin jobs overwrite populated reports, expose partial translation failure, and protect empty history', async () => {
 const db=await testDatabase();
 const oldKey=process.env.DEEPSEEK_API_KEY,oldFetch=globalThis.fetch;
 process.env.DEEPSEEK_API_KEY='test-only-daily-secret';
 let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  return calls===1?Response.json({choices:[{message:{content:JSON.stringify({headline:'新日报',overview:'新总览',wechatDraft:'新稿件',videoScript:'新口播'})}}]}):new Response('',{status:503});
 };
 try {
  const {dailyGenerationPreview}=await import('../src/lib/admin-daily');
  const {runJob,getJob,createJob}=await import('../src/lib/admin-jobs');
  const {readJobLogs}=await import('../src/lib/admin-job-logs');
  const original=report('2025-11-13');
  db.saveDailyReportToDb(original);
  assert.equal(dailyGenerationPreview('2025-11-13').snapshotCount,0);
  assert.throws(()=>createJob({kind:'daily',reportDate:'2025-11-13'}),/快照|话题/);
  const seedJob=()=>{
   const id=randomUUID();
   db.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'daily','queued',?,?,?)").run(id,JSON.stringify({kind:'daily',reportDate:'2025-11-13'}),Date.now(),Date.now());
   return id;
  };
  const emptyId=seedJob();
  assert.equal((await runJob(emptyId)).status,'failed');
  assert.deepEqual(db.readDailyReportFromDb('2025-11-13'),original);
  assert.equal(calls,0);
  db.saveSnapshotToDb(snapshot('2025-11-13-20','2025-11-13T12:00:00Z'));
  db.saveTopicAnalysisToDb('2025-11-13-20','topic-one',original.topics[0].aiAnalysis!);
  const preview=dailyGenerationPreview('2025-11-13');
  assert.equal(preview.snapshotCount,1);
  assert.equal(preview.windowStart,'2025-11-13-02');
  assert.equal(preview.windowEnd,'2025-11-14-02');
  assert.equal(preview.existing,true);
  const id=seedJob();
  const finished=await runJob(id);
  assert.equal(finished.status,'partial',finished.error??undefined);
  assert.equal(finished.result.daily?.reportDate,'2025-11-13');
  assert.equal(finished.result.daily?.englishReady,false);
  assert.equal(db.readDailyReportFromDb('2025-11-13')?.headline,'新日报');
  assert.equal(db.readDailyReportFromDb('2025-11-13')?.shareEnglish,undefined);
  assert.equal(calls,2);
  const messages=readJobLogs(id).entries.map(line=>line.message).join('\n');
  assert.match(messages,/Top10/);
  assert.match(messages,/中文.*保存|保存.*中文/);
  assert.match(messages,/503/);
  assert.match(messages,/英文/);
  assert.equal(getJob(id).status,'partial');

  const translated=(options?:RequestInit)=>{
   const request=JSON.parse(String(options?.body));
   const source=JSON.parse(request.messages[1].content);
   function convert(value:unknown,key=''):unknown {
    if(typeof value==='string')return key==='id'||key==='sourceId'?value:value.replace(/\p{Script=Han}+/gu,'English');
    if(Array.isArray(value))return value.map(item=>convert(item));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([field,item])=>[field,convert(item,field)]));
    return value;
   }
   return Response.json({choices:[{message:{content:JSON.stringify(convert(source))}}]});
  };
  let aiCalls=0;
  globalThis.fetch=async(_url,options)=>{
   aiCalls++;
   return aiCalls===1?Response.json({choices:[{message:{content:JSON.stringify({headline:'部分标题',overview:'部分总览'})}}]}):translated(options);
  };
  const mixed=await runJob(seedJob());
  assert.equal(mixed.result.daily?.englishReady,true);
  assert.equal(mixed.status,'partial');
  assert.match(mixed.result.daily!.model,/local-template/);
  assert.match(readJobLogs(mixed.id).entries.map(entry=>entry.message).join('\n'),/wechatDraft|videoScript/);

  db.getDb().prepare('delete from topic_analyses').run();
  globalThis.fetch=async(url,options)=>{
   if(!String(url).includes('api.deepseek.com'))return new Response('',{status:404});
   const body=JSON.parse(String(options?.body));
   if(body.max_tokens===8192)return new Response('invalid credential test-only-daily-secret',{status:401});
   if(body.max_tokens===12000)return translated(options);
   return Response.json({choices:[{message:{content:JSON.stringify({headline:'完整标题',overview:'完整总览',wechatDraft:'完整稿件',videoScript:'完整口播'})}}]});
  };
  const fallback=await runJob(seedJob());
  assert.equal(fallback.status,'partial');
  assert.equal(fallback.result.daily?.englishReady,true);
  assert.equal(fallback.result.daily?.analysisModel,'local-rules');
  const traceText=readJobLogs(fallback.id).entries.map(entry=>entry.message).join('\n');
  assert.match(traceText,/401/);
  assert.doesNotMatch(traceText,/test-only-daily-secret/);
  const oldWarn=console.warn;
  const warnings:string[]=[];
  console.warn=(...parts:unknown[])=>{warnings.push(parts.join(' '));};
  try {
   const {generateDailyReport}=await import('../src/lib/daily-report');
   await generateDailyReport(new Date('2025-11-14T02:00:00+08:00'));
   assert.match(warnings.join('\n'),/401/);
   assert.doesNotMatch(warnings.join('\n'),/test-only-daily-secret/);
  } finally {console.warn=oldWarn;}
 } finally {
  globalThis.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
  db.close();
 }
});
