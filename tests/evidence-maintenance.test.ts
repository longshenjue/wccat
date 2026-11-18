import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBusinessSchema} from '../src/lib/db-schema';
import {EvidenceStore} from '../src/lib/evidence-store';
import {backupEvidenceDatabase,verifyEvidenceBackup,backfillEvidence} from '../src/lib/evidence-maintenance';

test('complete backup includes WAL data and library evidence, verifies into a separate database and detects tampering',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-evidence-backup-'));
 const db=new Database(join(dir,'source.sqlite'));db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
 createBusinessSchema(db);const store=new EvidenceStore(db);
 try{
  store.recordBatch({id:'backup-run',source:{provider:'direct',platform:'bilibili',adapter:'v1',capability:'hotlist'},status:'success',response:{title:'备份原文'},items:[{url:'https://example.test/video/1',title:'备份证据',metrics:{likes:0}}]});
  const backup=await backupEvidenceDatabase(db,join(dir,'backups'));
  const verified=await verifyEvidenceBackup(backup.path);
  assert.equal(verified.counts.collection_runs,1);assert.equal(verified.counts.library_documents,1);assert.equal(verified.counts.snapshots,0);
  const restored=new Database(backup.path,{readonly:true});
  assert.equal((restored.prepare('select count(*) as n from document_observations').get() as {n:number}).n,1);restored.close();
  const original=readFileSync(backup.path);writeFileSync(backup.path,Buffer.concat([original,Buffer.from('tamper')]));
  await assert.rejects(()=>verifyEvidenceBackup(backup.path),/校验|hash|digest/i);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('backfill is bounded, repeatable and labels historical normalized evidence without inventing raw responses',()=>{
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');createBusinessSchema(db);
 const item={sourceId:'weibo',sourceName:'微博',rank:1,title:'历史记录',url:'https://example.test/legacy',stats:{likes:0},fetchedAt:'2026-11-01T00:00:00Z'};
 const payload=JSON.stringify({date:'2026-11-01-08',generatedAt:'2026-11-01T00:00:00Z',rawItems:[item],topics:[]});
 db.prepare('insert into snapshots values(?,?,?)').run('2026-11-01-08','2026-11-01T00:00:00Z',payload);
 db.prepare('insert into topics(snapshot_date,topic_id,rank,title,heat_score,sentiment,signal,official_public_resonance,payload) values(?,?,?,?,?,?,?,?,?)')
  .run('2026-11-01-08','legacy-topic',1,'历史记录',100,'neutral','new',0,JSON.stringify({occurrences:[item]}));
 db.prepare('insert into topic_analyses values(?,?,?,?,?)').run('2026-11-01-08','legacy-topic','local-rules','2026-11-01T00:10:00Z',JSON.stringify({summary:'历史分析',model:'local-rules'}));
 db.prepare('insert into ai_analysis_logs(snapshot_date,topic_id,provider,model,status,duration_ms,used_fallback,error,request_payload,response_payload,created_at) values(?,?,?,?,?,?,?,?,?,?,?)')
  .run('2026-11-01-08','legacy-topic','local','local-rules','success',1,1,null,JSON.stringify({articleContexts:[{text:'历史正文片段'}]}),JSON.stringify({summary:'历史分析'}),'2026-11-01T00:10:00Z');
 try{
  const first=backfillEvidence(db,{limit:1});assert.equal(first.processed,1);
  const second=backfillEvidence(db,{limit:1});assert.equal(second.processed,0);
  const runs=db.prepare('select provenance,response_hash,legacy_snapshot_date from collection_runs').all();
  assert.deepEqual(runs,[{provenance:'legacy_normalized',response_hash:null,legacy_snapshot_date:'2026-11-01-08'}]);
  assert.deepEqual(db.prepare('select metric,numeric_value from metric_observations').all(),[{metric:'likes',numeric_value:0}]);
  assert.equal((db.prepare('select count(*) as n from snapshots').get() as {n:number}).n,1);
  assert.equal((db.prepare('select count(*) as n from analysis_evidence').get() as {n:number}).n,1);
  assert.equal((db.prepare("select generated_at from analysis_records where purpose='topic-analysis'").get() as {generated_at:string}).generated_at,'2026-11-01T00:10:00.000Z');
  assert.deepEqual(db.prepare("select prompt_version,algorithm_version from analysis_records where purpose='topic-analysis'").get(),{prompt_version:'legacy-unknown',algorithm_version:null});
  const trace=db.prepare("select input_hash from analysis_records where purpose='topic-analysis-attempt'").get() as {input_hash:string};
  assert.ok(trace);assert.ok(JSON.stringify(new EvidenceStore(db).readBlob(trace.input_hash)).includes('历史正文片段'));
  backfillEvidence(db,{limit:1,force:true});
  assert.equal((db.prepare('select count(*) as n from analysis_records').get() as {n:number}).n,2);
 }finally{db.close();}
});
