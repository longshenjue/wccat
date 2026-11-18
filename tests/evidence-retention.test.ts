import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,testDatabase} from './helpers/data-fixtures';
import {backupEvidenceDatabase,backfillEvidence} from '../src/lib/evidence-maintenance';
import {EvidenceStore} from '../src/lib/evidence-store';
import {acquireMaintenance,advanceGeneration,releaseMaintenance} from '../src/lib/maintenance';
import {guardedWrite} from '../src/lib/maintenance';
import {withEvidenceCapture} from '../src/lib/evidence-capture';
import {fetchAllSources} from '../src/lib/ingest';
import {getSourceById} from '../src/lib/sources';

let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});
after(()=>ctx.close());

test('same-hour snapshot replacement and later cleanup retain observations and analysis inputs',async()=>{
 const db=ctx.getDb();
  const first=snapshot('2026-11-01-08','2026-11-01T00:00:00Z');first.rawItems[0].stats={likes:0};
  ctx.saveSnapshotToDb(first);
  const next=structuredClone(first);next.generatedAt='2026-11-01T00:30:00Z';next.rawItems[0].stats={likes:8};ctx.saveSnapshotToDb(next);
  assert.equal((db.prepare('select count(*) as n from document_observations').get() as {n:number}).n,2);
  const analysis={summary:'解释',detailedContent:'内容',outsiderContext:'背景',battle:{redLabel:'疑问',blueLabel:'说明',redScore:40,blueScore:60,redRationale:'依据',blueRationale:'依据'},platformAnalyses:[],model:'local-rules'};
  ctx.saveTopicAnalysisToDb(next.date,'topic-one',analysis);
  assert.equal((db.prepare('select count(*) as n from analysis_evidence').get() as {n:number}).n,1);
  ctx.saveAiAnalysisLogToDb(next.date,'topic-one',{provider:'local',model:'local-rules',status:'success',durationMs:1,usedFallback:true,
    request:{articleContexts:[{url:'https://example.test/story',text:'用于解释的完整输入片段'}]},response:analysis});
  db.prepare('delete from snapshots where date=?').run(first.date);
  assert.equal((db.prepare('select count(*) as n from raw_items').get() as {n:number}).n,0);
  assert.equal((db.prepare('select count(*) as n from document_observations').get() as {n:number}).n,2);
  const store=new EvidenceStore(db);assert.equal(store.stats().tables.analysis_records,2);
  const input=db.prepare("select input_hash from analysis_records where purpose='topic-analysis-attempt'").get() as {input_hash:string};
  assert.ok(JSON.stringify(store.readBlob(input.input_hash)).includes('用于解释的完整输入片段'));
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
});

test('stale snapshot generation cannot add library evidence after maintenance',async()=>{
 const db=ctx.getDb();const count=new EvidenceStore(db).stats().tables.collection_runs;
  const generation=ctx.writeGeneration();acquireMaintenance(db,'fixture');advanceGeneration(db,'fixture');releaseMaintenance(db,'fixture');
  assert.throws(()=>ctx.saveSnapshotToDb(snapshot('2026-11-01-08'),generation),/数据版本/);
  assert.equal(new EvidenceStore(db).stats().tables.collection_runs,count);
});

test('maintenance during network acquisition rejects evidence even through allSettled source collection',async t=>{
 const db=ctx.getDb(),generation=ctx.writeGeneration(),count=new EvidenceStore(db).stats().tables.collection_runs;
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>{
  acquireMaintenance(db,'network-fixture');advanceGeneration(db,'network-fixture');releaseMaintenance(db,'network-fixture');
  return new Response(JSON.stringify({data:{realtime:[{word:'维护期间的响应'}]}}));
 };
 t.after(()=>{globalThis.fetch=previous;});
 await assert.rejects(()=>withEvidenceCapture(batch=>guardedWrite(db,()=>{new EvidenceStore(db).recordBatch(batch);},generation),()=>fetchAllSources([getSourceById('weibo')!])),/数据版本/);
 assert.equal(new EvidenceStore(db).stats().tables.collection_runs,count);
});

test('automatic legacy persistence and complete backups do not retain credential markers from upstream or AI data',async t=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='marker-runtime-api-key-8a7b';
 t.after(()=>{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;});
 const value=snapshot('2026-11-03-08');
 value.rawItems[0].url+='?api_key=marker-query&X-Amz-Signature=marker-signature';
 value.rawItems[0].description=JSON.stringify({clientSecret:'marker-client',smsCode:'marker-sms'});
 value.topics[0].occurrences[0]={...value.topics[0].occurrences[0],...value.rawItems[0]};
 ctx.saveSnapshotToDb(value);
 ctx.saveAiAnalysisLogToDb(value.date,'topic-one',{provider:'local',model:'local-rules',status:'success',durationMs:1,usedFallback:true,
   request:{clientSecret:'marker-client',smsCode:'marker-sms'},response:{url:value.rawItems[0].url,text:'Provider accidentally echoed marker-runtime-api-key-8a7b'}});
 const backup=await backupEvidenceDatabase(ctx.getDb(),ctx.dir+'/privacy-backup');
 const Database=(await import('better-sqlite3')).default;const copy=new Database(backup.path,{readonly:true});
 try{
  const text=['snapshots','raw_items','topics','ai_analysis_logs'].map(table=>JSON.stringify(copy.prepare('select * from '+table).all())).join('');
  for(const marker of ['marker-query','marker-signature','marker-client','marker-sms','marker-runtime-api-key-8a7b'])assert.equal(text.includes(marker),false);
 }finally{copy.close();}
});

test('development topic analysis also retains the actual supplied article context without adding an AI request',async t=>{
 const key=process.env.DEEPSEEK_API_KEY,env=process.env.NODE_ENV,previous=globalThis.fetch;
 delete process.env.DEEPSEEK_API_KEY;(process.env as Record<string,string|undefined>).NODE_ENV='development';
 globalThis.fetch=async()=>new Response('<html><body>开发入口实际正文</body></html>');
 t.after(()=>{globalThis.fetch=previous;if(key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=key;
   if(env===undefined)delete (process.env as Record<string,string|undefined>).NODE_ENV;else (process.env as Record<string,string|undefined>).NODE_ENV=env;});
 const value=snapshot('2026-11-04-08');ctx.saveSnapshotToDb(value);
 const {POST}=await import('../src/app/api/analyze-topic/route');
 const response=await POST(new Request('http://localhost/api/analyze-topic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:value.date,topic:value.topics[0]})}));
 assert.equal(response.status,200);
 const row=ctx.getDb().prepare("select input_hash from analysis_records where legacy_snapshot_date=? and purpose='topic-analysis-attempt' order by rowid desc limit 1").get(value.date) as {input_hash:string}|undefined;
 assert.ok(row);assert.ok(JSON.stringify(new EvidenceStore(ctx.getDb()).readBlob(row.input_hash)).includes('开发入口实际正文'));
});

test('normal and forced backfill reuse evidence and attempts already saved by current writers',()=>{
 const store=new EvidenceStore(ctx.getDb());
 const before=store.stats().tables;
 backfillEvidence(ctx.getDb(),{limit:100});backfillEvidence(ctx.getDb(),{limit:100,force:true});
 const after=store.stats().tables;
 for(const table of ['collection_runs','document_observations','metric_observations','analysis_records'])assert.equal(after[table],before[table],table);
});
