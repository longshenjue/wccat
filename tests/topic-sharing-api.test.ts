import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('topic sharing API authenticates reads, rejects cross-origin writes and runs generation only as a queued job',async()=>{
 const ctx=await testDatabase(),oldHash=process.env.WCCAT_ADMIN_PASSWORD_HASH,oldSecret=process.env.WCCAT_ADMIN_SESSION_SECRET,oldKey=process.env.DEEPSEEK_API_KEY,oldFetch=globalThis.fetch,oldResearch=process.env.WCCAT_TOPIC_RESEARCH_ENABLED;
 try{
  process.env.WCCAT_TOPIC_RESEARCH_ENABLED='false';
  const auth=await import('../src/lib/admin-auth');process.env.WCCAT_ADMIN_PASSWORD_HASH=auth.hashAdminPassword('test-only-admin-password');process.env.WCCAT_ADMIN_SESSION_SECRET='test-only-session-secret-at-least-32-characters';process.env.DEEPSEEK_API_KEY='';
  const {GET,POST}=await import('../src/app/api/admin/topic-share/route');
  const {runJob}=await import('../src/lib/admin-jobs');
  ctx.saveDailyReportToDb(report('2026-11-24'));
  const cookie='wccat_admin='+auth.createAdminSession(),ref={kind:'daily',date:'2026-11-24',topicId:'topic-one'};
  const get=(query:string,loggedIn=true)=>GET(new Request('https://example.test/api/admin/topic-share?'+query,{headers:loggedIn?{cookie}:{}}));
  const post=(body:unknown,origin='https://example.test')=>POST(new Request('https://example.test/api/admin/topic-share',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network in cached reads');};
  assert.equal((await get('ref='+encodeURIComponent(JSON.stringify(ref)),false)).status,401);
  assert.equal((await post({action:'generate',ref},'https://evil.test')).status,403);
  const read=await get('ref='+encodeURIComponent(JSON.stringify(ref)));assert.equal(read.status,200);const payload=await read.json();assert.equal(payload.record,null);assert.equal(payload.source.topicId,'topic-one');assert.equal(calls,0);
  assert.equal((await get('action=recommendations&date=2026-11-24')).status,200);assert.equal(calls,0);
  assert.equal((await post({action:'generate',ref,column:'unknown'})).status,400);
  assert.equal((await post({action:'generate',ref,force:'true'})).status,400);
  assert.equal((await post({action:'save',id:payload.source.sourceKey,copy:{},expectedRevision:'none'})).status,404);
  assert.equal((await get('ref=not-json')).status,400);
  const changed=report('2026-11-24');changed.topics[0].aiAnalysis!.detailedContent='相同时间戳下修改过的材料';ctx.saveDailyReportToDb(changed);
  assert.equal((await post({action:'generate',ref,expectedSourceFingerprint:payload.source.fingerprint,expectedRevision:'none'})).status,409,'a queued request cannot silently use a changed same-timestamp source');
  ctx.saveDailyReportToDb(report('2026-11-24'));
  // In-process seeded jobs exercise the same runner without launching child processes.
  const id=randomUUID(),now=Date.now();ctx.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'topic-sharing','queued',?,?,?)").run(id,JSON.stringify({kind:'topic-sharing',topicRef:payload.source.ref,expectedRevision:'none'}),now,now);
  const job=await runJob(id);assert.equal(job.kind,'topic-sharing');assert.equal(job.status,'failed');assert.match(job.error??'',/DeepSeek|API|配置/);assert.equal(calls,0);
  const source=(await (await get('ref='+encodeURIComponent(JSON.stringify(ref)))).json()).source;
  const copy=topicShareCopy(source);process.env.DEEPSEEK_API_KEY='test-only-key';
  const generated=structuredClone(copy);generated.en.summary='One scene shows 中文名称 and a translation for human review.';
  globalThis.fetch=async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({column:'inside',en:generated.en,zh:generated.zh})}}]});};
  const successId=randomUUID();ctx.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'topic-sharing','queued',?,?,?)").run(successId,JSON.stringify({kind:'topic-sharing',topicRef:source.ref,expectedRevision:'none',expectedSourceFingerprint:source.fingerprint}),now,now);
  const complete=await runJob(successId);assert.equal(complete.status,'complete',complete.error??undefined);assert.equal(complete.result.topicSharing?.id,source.sourceKey);assert.equal(calls,1);
  const saved=await get('id='+source.sourceKey);assert.equal(saved.status,200);const savedPayload=await saved.json();assert.equal(savedPayload.record.copy.en.posts.length,3);assert.equal(calls,1,'loading a finished job never regenerates its copy');
  assert.equal(savedPayload.record.copy.en.summary,generated.en.summary);assert.ok(savedPayload.record.reviewWarnings.some((item:{code:string})=>item.code==='language'));
  const savedEdit=await post({action:'save',id:source.sourceKey,expectedRevision:savedPayload.record.revision,copy:{...savedPayload.record.copy,en:{...savedPayload.record.copy.en,headline:'A saved editor change'}}});assert.equal(savedEdit.status,200);assert.equal(calls,1,'manual saves do not invoke AI');
  assert.equal(ctx.readDailyReportFromDb('2026-11-24')?.headline,'日报');
 }finally{if(oldResearch===undefined)delete process.env.WCCAT_TOPIC_RESEARCH_ENABLED;else process.env.WCCAT_TOPIC_RESEARCH_ENABLED=oldResearch;globalThis.fetch=oldFetch;process.env.WCCAT_ADMIN_PASSWORD_HASH=oldHash;process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;ctx.close();}
});
