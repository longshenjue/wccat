import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EvidenceStore} from '../src/lib/evidence-store';
import {fetchSource} from '../src/lib/ingest';
import {getSourceById} from '../src/lib/sources';
import {withEvidenceCapture} from '../src/lib/evidence-capture';
import {createBusinessSchema} from '../src/lib/db-schema';
import {backfillEvidence,backupEvidenceDatabase} from '../src/lib/evidence-maintenance';
import {recordLegacyAnalysis,recordAnalysisTrace} from '../src/lib/evidence-legacy';
import type {EvidenceBatch} from '../src/lib/evidence-types';
import {snapshot} from './helpers/data-fixtures';
import {report} from './helpers/data-fixtures';

const source={provider:'direct',platform:'weibo',adapter:'review',capability:'hotlist' as const};

test('same-title videos retain distinct raw objects and their own interaction counts',async t=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{list:[{title:'相同标题',bvid:'BVfirst',stat:{like:3}},{title:'相同标题',bvid:'BVsecond',stat:{like:21}}]}}));
 t.after(()=>{globalThis.fetch=previous;});const batches:EvidenceBatch[]=[];
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(getSourceById('bilibili')!));
 assert.deepEqual(batches[0].items.map(item=>(item.payload as {bvid:string}).bvid),['BVfirst','BVsecond']);
 assert.deepEqual(batches[0].items.map(item=>item.metrics?.likes),[3,21]);
});

test('unsafe integer IDs produce two exact question URLs and two evidence documents',async t=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response('{"data":[{"target":{"id":90071992547409931234,"title":"同名问题"}},{"target":{"id":90071992547409931235,"title":"同名问题"}}]}');
 t.after(()=>{globalThis.fetch=previous;});const db=new Database(':memory:'),store=new EvidenceStore(db);
 try{
  const items=await withEvidenceCapture(batch=>{store.recordBatch(batch);},()=>fetchSource(getSourceById('zhihu')!));
  assert.deepEqual(items.map(item=>item.url),['https://www.zhihu.com/question/90071992547409931234','https://www.zhihu.com/question/90071992547409931235']);
  assert.equal(store.stats().tables.library_documents,2);assert.equal(store.stats().tables.document_observations,2);
 }finally{db.close();}
});

test('known distinct object IDs cannot silently merge through a shared landing URL',()=>{
 const db=new Database(':memory:'),store=new EvidenceStore(db);
 try{
  store.recordBatch({id:'id-a',source,status:'success',items:[{url:'https://example.test/landing',platformId:'111',title:'甲'}]});
  assert.throws(()=>store.recordBatch({id:'id-b',source,status:'success',items:[{url:'https://example.test/landing',platformId:'222',title:'乙'}]}),/冲突|identity|身份/i);
  assert.equal(store.stats().tables.library_documents,1);assert.equal(store.stats().tables.collection_runs,1);
 }finally{db.close();}
});

test('search retries return the same ordered document list and preserve the actual hit count',()=>{
 const db=new Database(':memory:'),store=new EvidenceStore(db);
 try{
  const input={id:'search-retry',source:{...source,capability:'search' as const,platform:'web'},query:'新闻进展',hits:[{position:1,url:'https://example.test/a'}]};
  assert.deepEqual(store.recordSearch(input),store.recordSearch(input));
  assert.equal((db.prepare('select item_count from collection_runs').get() as {item_count:number}).item_count,1);
 }finally{db.close();}
});

test('business rejection, invalid JSONP and genuine empty data remain distinguishable',async t=>{
 const previous=globalThis.fetch;
 const batches:EvidenceBatch[]=[];t.after(()=>{globalThis.fetch=previous;});
 globalThis.fetch=async()=>new Response('{"code":-412,"message":"request blocked"}');
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource({...getSourceById('bilibili')!,thirdPartyUrl:undefined}));
 assert.equal(batches[0].status,'failed');assert.match(batches[0].error??'',/-412/);
 globalThis.fetch=async()=>new Response('var bad = {broken;');
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource({...getSourceById('sina-news')!,thirdPartyUrl:undefined}));
 assert.equal(batches[1].status,'failed');assert.ok(batches[1].error);
 globalThis.fetch=async()=>new Response('{"code":0,"data":{"list":[]}}');
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource({...getSourceById('bilibili')!,thirdPartyUrl:undefined}));
 assert.equal(batches[2].status,'empty');
});

test('captured upstream length and stored truncation state do not claim an incomplete response is complete',async t=>{
 const previous=globalThis.fetch,batches:EvidenceBatch[]=[];
 const body=JSON.stringify({data:{list:[]},padding:'a'.repeat(3_000_000)});
 globalThis.fetch=async()=>new Response(body,{headers:{'content-length':String(Buffer.byteLength(body))}});t.after(()=>{globalThis.fetch=previous;});
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource({...getSourceById('bilibili')!,thirdPartyUrl:undefined}));
 assert.equal(batches[0].responseSourceBytes,Buffer.byteLength(body));assert.equal(batches[0].responseCapturedBytes,2*1024*1024);
 assert.equal(batches[0].status,'partial');
 const db=new Database(':memory:'),store=new EvidenceStore(db,{maxBlobBytes:256});
 try{store.recordBatch({source,status:'success',response:'a'.repeat(1000),items:[]});assert.equal((db.prepare('select status from collection_runs').get() as {status:string}).status,'partial');}
 finally{db.close();}
});

test('backfill and forced backfill do not duplicate valid captured observations or existing conclusions',()=>{
 const db=new Database(':memory:');createBusinessSchema(db);const store=new EvidenceStore(db);
 try{
  const value=snapshot('2026-11-01-08');const run=store.recordBatch({id:'live-run',source,status:'success',legacySnapshotDate:value.date,items:[{url:value.rawItems[0].url,title:value.rawItems[0].title}]});
  value.evidenceRunIds=[run.runId];db.prepare('insert into snapshots values(?,?,?)').run(value.date,value.generatedAt,JSON.stringify(value));
  db.prepare('insert into topics(snapshot_date,topic_id,rank,title,heat_score,sentiment,signal,official_public_resonance,payload) values(?,?,?,?,?,?,?,?,?)').run(value.date,'topic-one',1,value.topics[0].title,100,'neutral','new',0,JSON.stringify(value.topics[0]));
  const analysis=report('2026-11-01').topics[0].aiAnalysis!;
  recordLegacyAnalysis(db,value.date,'topic-one',analysis,run.runId?[run.runId]:undefined);
  db.prepare('insert into topic_analyses values(?,?,?,?,?)').run(value.date,'topic-one',analysis.model,value.generatedAt,JSON.stringify(analysis));
  backfillEvidence(db,{limit:5});backfillEvidence(db,{limit:5,force:true});
  assert.equal(store.stats().tables.document_observations,1);assert.equal(store.stats().tables.collection_runs,1);assert.equal(store.stats().tables.analysis_records,1);
 }finally{db.close();}
});

test('conclusions supersede conclusions, explicitly reference their attempt, and use the original topic after replacement',()=>{
 const db=new Database(':memory:');createBusinessSchema(db);const store=new EvidenceStore(db);
 try{
  const value=snapshot('2026-11-01-08');const run=store.recordBatch({id:'analysis-live',source,status:'success',legacySnapshotDate:value.date,items:[{url:value.rawItems[0].url,title:value.rawItems[0].title}]});
  db.prepare('insert into snapshots values(?,?,?)').run(value.date,value.generatedAt,JSON.stringify(value));
  const original=value.topics[0];const replacement={...original,occurrences:[{...original.occurrences[0],url:'https://example.test/replaced'}]};
  db.prepare('insert into topics(snapshot_date,topic_id,rank,title,heat_score,sentiment,signal,official_public_resonance,payload) values(?,?,?,?,?,?,?,?,?)').run(value.date,'topic-one',1,'replacement',100,'neutral','new',0,JSON.stringify(replacement));
  const analysis=report('2026-11-01').topics[0].aiAnalysis!;
  const firstAttempt=recordAnalysisTrace(db,value.date,'topic-one',{provider:'local',model:analysis.model,status:'success',usedFallback:true,durationMs:1,request:{text:'首次上下文'},response:analysis});
  const first=recordLegacyAnalysis(db,value.date,'topic-one',analysis,[run.runId],{topic:original,attemptId:firstAttempt});
  const secondAttempt=recordAnalysisTrace(db,value.date,'topic-one',{provider:'local',model:analysis.model,status:'success',usedFallback:true,durationMs:1,request:{text:'后续上下文'},response:analysis});
  const second=recordLegacyAnalysis(db,value.date,'topic-one',analysis,[run.runId],{topic:original,attemptId:secondAttempt});
  const row=db.prepare('select supersedes,attempt_id,prompt_version from analysis_records where id=?').get(second);
  const attempt=db.prepare('select prompt_version from analysis_records where id=?').get(secondAttempt) as {prompt_version:string};
  assert.deepEqual(row,{supersedes:first,attempt_id:secondAttempt,prompt_version:attempt.prompt_version});
  assert.equal((db.prepare('select observation_id from analysis_evidence where analysis_id=?').get(second) as {observation_id:string}).observation_id,run.observationIds[0]);
 }finally{db.close();}
});

test('a database missing required evidence tables cannot produce a successful complete backup',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-missing-evidence-'));const db=new Database(':memory:');createBusinessSchema(db);new EvidenceStore(db);db.exec('drop table analysis_evidence');
 try{await assert.rejects(()=>backupEvidenceDatabase(db,dir),/缺少|结构|schema|table/i);}
 finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
