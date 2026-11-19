import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {ProviderState,ensureProviderSchema,validateProviderSchema} from '../src/lib/provider-state';
import {TianApiClient,readTianApiConfig} from '../src/lib/tianapi/client';
import {normalizeTianItems,tianTopicKey} from '../src/lib/tianapi/catalog';
import {createBusinessSchema} from '../src/lib/db-schema';
import {EvidenceStore} from '../src/lib/evidence-store';
import {backupEvidenceDatabase,verifyEvidenceBackup} from '../src/lib/evidence-maintenance';

const require=createRequire(import.meta.url),key='review-secret-key-7c11',start=Date.parse('2026-11-19T03:00:00Z');
function client(payload:unknown,state=new ProviderState(new Database(':memory:')),now:()=>number=()=>start){return new TianApiClient(state,readTianApiConfig({TIANAPI_KEY:key})!,{now,fetch:async()=>Response.json(payload)});}
const ok={code:200,msg:'success',result:{list:[{hotword:'完整事件',hotwordnum:'1',hottag:'热'}]}};

test('literal credentials echoed as object property names never enter cache or evidence',async()=>{
 const c=client({...ok,[key]:{[key]:'echo'}});
 try{const result=await c.fetch('weibohot');assert.equal(JSON.stringify(result).includes(key),false);assert.equal(JSON.stringify(c.state.db.prepare('select cache_json from provider_request_state').all()).includes(key),false);}
 finally{c.state.db.close();}
});

test('normalized payload expansion is a provider failure and releases its lease instead of aborting a refresh',async()=>{
 const c=client({...ok,url:'https://example.test/'+ '中'.repeat(240000)});
 try{const result=(await c.fetch('weibohot'))!;assert.equal(result.batch.status,'failed');assert.equal(result.items.length,0);
  const row=c.state.db.prepare('select lease_owner,blocked_until from provider_request_state').get() as {lease_owner:string|null;blocked_until:number};assert.equal(row.lease_owner,null);assert.ok(row.blocked_until>start);
 }finally{c.state.db.close();}
});

test('cache keeps unknown upstream freshness unknown',async()=>{
 const c=client(ok);try{const first=(await c.fetch('weibohot'))!,cached=(await c.fetch('weibohot'))!;
  assert.equal(first.batch.sourceUpdatedAt,undefined);assert.equal(cached.batch.sourceUpdatedAt,undefined);
 }finally{c.state.db.close();}
});
test('semantic title keys preserve decimal signs and distinct headlines',()=>{
 assert.notEqual(tianTopicKey('公司增长 3.5%'),tianTopicKey('公司增长 35%'));
 assert.notEqual(tianTopicKey('公司增长 -3.5%'),tianTopicKey('公司增长 +3.5%'));
 assert.notEqual(tianTopicKey('学习 C#'),tianTopicKey('学习 C'));
 const values=normalizeTianItems('weibohot',[{hotword:'公司增长 3.5%'},{hotword:'公司增长 35%'}],new Date(start).toISOString());assert.equal(values.items.length,2);
});

function heldWriter(file:string,clock?:SharedArrayBuffer,initialize=false,trigger?:SharedArrayBuffer){
 return new Worker(`const {workerData:d,parentPort}=require('node:worker_threads');const Database=require(d.sqlite);const db=new Database(d.file);if(d.trigger){parentPort.postMessage('ready');Atomics.wait(new Int32Array(d.trigger),0,0);}db.exec('BEGIN IMMEDIATE');if(d.trigger){Atomics.store(new Int32Array(d.trigger),1,1);Atomics.notify(new Int32Array(d.trigger),1);}else parentPort.postMessage('locked');setTimeout(()=>{try{if(d.initialize){require(d.tsx);require(d.module).ensureProviderSchema(db);}if(d.clock)Atomics.store(new BigInt64Array(d.clock),0,BigInt(d.after));db.exec('COMMIT');db.close();}catch(e){throw e;}},200);`,
  {eval:true,workerData:{file,clock,trigger,after:Date.parse('2026-11-19T16:00:00.100Z'),initialize,sqlite:require.resolve('better-sqlite3'),tsx:require.resolve('tsx/cjs'),module:resolve('src/lib/provider-state.ts')}});
}
test('reservation clock is sampled after waiting for a real SQLite writer across Beijing midnight',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-clock-lock-')),db=new Database(join(dir,'state.sqlite'));const state=new ProviderState(db),clock=new SharedArrayBuffer(8);Atomics.store(new BigInt64Array(clock),0,BigInt(Date.parse('2026-11-19T15:59:59.900Z')));
 const trigger=new SharedArrayBuffer(8),worker=heldWriter(db.name,clock,false,trigger);try{await once(worker,'message');let first=true;
  const c=client(ok,state,()=>{const value=Number(Atomics.load(new BigInt64Array(clock),0));if(first){first=false;Atomics.store(new Int32Array(trigger),0,1);Atomics.notify(new Int32Array(trigger),0);assert.notEqual(Atomics.wait(new Int32Array(trigger),1,0,5000),'timed-out');}return value;});await c.fetch('weibohot');
  assert.deepEqual(state.status(c.account).usage.map(row=>row.day),['2026-11-20']);
  const next=db.prepare('select next_at from provider_dispatch').get() as {next_at:number};assert.ok(next.next_at>Number(Atomics.load(new BigInt64Array(clock),0)));
 }finally{await worker.terminate();db.close();rmSync(dir,{recursive:true,force:true});}
});

test('simultaneous first opens serialize initialization',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-schema-lock-')),db=new Database(join(dir,'state.sqlite'));db.exec('create table sentinel(id integer)');
 const worker=heldWriter(db.name,undefined,true);
 try{await once(worker,'message');assert.doesNotThrow(()=>ensureProviderSchema(db));}
 finally{await worker.terminate();db.close();rmSync(dir,{recursive:true,force:true});}
});
test('partial provider tables cannot masquerade as a valid old backup',()=>{
 const db=new Database(':memory:');try{new ProviderState(db);db.exec('drop table provider_meta');assert.throws(()=>validateProviderSchema(db),/provider_meta|缺少/);}finally{db.close();}
});

test('complete backup restores both evidence and persistent cache/quota without spending another request',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-provider-restore-')),db=new Database(':memory:');createBusinessSchema(db);new EvidenceStore(db);const state=new ProviderState(db);
 try{state.acquire('restore','weibohot',start,1,'owner');state.complete('restore','weibohot','owner',start,ok,start+1800000);
  const backup=await backupEvidenceDatabase(db,dir);await verifyEvidenceBackup(backup.path);copyFileSync(backup.path,join(dir,'restored.sqlite'));
  const copy=new Database(join(dir,'restored.sqlite'));try{const restored=new ProviderState(copy);assert.equal(restored.acquire('restore','weibohot',start+1000,1,'other').kind,'cached');assert.equal(restored.acquire('restore','weibohot',start+1800001,1,'other').kind,'blocked');}finally{copy.close();}
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
