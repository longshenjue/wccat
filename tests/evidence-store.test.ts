import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {EvidenceStore} from '../src/lib/evidence-store';

const source={provider:'direct',platform:'weibo',adapter:'test-v1',capability:'hotlist' as const};
const story={url:'https://news.example/story?id=7&utm_source=feed#comments',title:'事件初报',text:'原始报道正文',metrics:{likes:0,comments:null}};
const count=(db:Database.Database,table:string)=>Number((db.prepare('select count(*) as n from '+table).get() as {n:number}).n);

test('repeated observations keep zero and unknown separate without copying content revisions',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  const first=store.recordBatch({id:'run-1',source,status:'success',observedAt:'2026-11-18T00:00:00Z',response:{data:[story]},items:[story,story]});
  store.recordBatch({id:'run-1',source,status:'success',items:[story]});
  store.recordBatch({id:'run-2',source,status:'success',observedAt:'2026-11-18T01:00:00Z',items:[{...story,metrics:{likes:10,comments:2}}]});
  assert.equal(count(db,'library_documents'),1);assert.equal(count(db,'document_revisions'),1);
  assert.equal(count(db,'collection_runs'),2);assert.equal(count(db,'document_observations'),2);
  const metrics=db.prepare('select metric,numeric_value,status from metric_observations where observation_id=? order by metric').all(first.observationIds[0]);
  assert.deepEqual(metrics,[{metric:'comments',numeric_value:null,status:'missing'},{metric:'likes',numeric_value:0,status:'observed'}]);
  assert.equal(store.readDocument(first.documentIds[0])?.url,'https://news.example/story?id=7');
 }finally{db.close();}
});

test('different search providers retain their own queries and ranks for the same document',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  const a=store.recordSearch({id:'search-1',source:{...source,platform:'web',provider:'tavily',capability:'search'},query:'突发事件 后续',language:'zh',region:'CN',hits:[{url:story.url,title:story.title,position:1,snippet:'报道片段'}]});
  const b=store.recordSearch({id:'search-2',source:{...source,platform:'web',provider:'serper',capability:'search'},query:'突发事件 后续',language:'zh',region:'CN',hits:[{url:story.url,title:story.title,position:8,snippet:'另一段摘要'}]});
  assert.equal(count(db,'library_documents'),1);assert.equal(count(db,'search_queries'),1);assert.equal(count(db,'search_hits'),2);
  assert.equal(store.readSearch(a.runId)?.hits[0].position,1);assert.equal(store.readSearch(b.runId)?.hits[0].position,8);
  assert.equal(store.readSearch(a.runId)?.provider,'tavily');
 }finally{db.close();}
});

test('source text changes create revisions while old event and analysis evidence remains anchored',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  const a=store.recordBatch({id:'revision-a',source,status:'success',items:[story]});
  const event=store.createEvent({title:'长期事件线索'});
  store.linkEventEvidence({eventId:event,observationId:a.observationIds[0],role:'initial_report',method:'manual',reason:'最早报道'});
  const analysis=store.recordAnalysis({purpose:'event-summary',model:'local-test',promptVersion:'v1',input:{context:'当时实际使用的正文片段'},output:{summary:'初始结论'},observationIds:a.observationIds});
  store.recordBatch({id:'revision-b',source,status:'success',items:[{...story,text:'更正后的报道正文'}]});
  assert.equal(count(db,'document_revisions'),2);
  const detail=store.readDocument(a.documentIds[0]);assert.equal(detail?.revisions.length,2);
  assert.equal(store.readEvent(event)?.evidence[0].observation_id,a.observationIds[0]);
  assert.equal((db.prepare('select observation_id from analysis_evidence where analysis_id=?').get(analysis) as {observation_id:string}).observation_id,a.observationIds[0]);
  const input=db.prepare('select input_hash from analysis_records where id=?').get(analysis) as {input_hash:string};
  assert.deepEqual(store.readBlob(input.input_hash),{context:'当时实际使用的正文片段'});
  const second=store.createEvent({title:'后续影响'});
  store.recordEventRelation({fromEventId:event,toEventId:second,type:'follow_up',status:'hypothesis',reason:'待交叉验证',observationIds:a.observationIds});
  assert.equal(store.readEvent(event)?.relations.length,1);
 }finally{db.close();}
});

test('credentials are scrubbed recursively and payloads are content-addressed and decodable',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  const response={data:{title:'有效新闻',access_token:'secret-access',clientSecret:'secret-client',smsCode:'secret-sms',url:'https://news.example/story?id=7&api_key=secret-url&X-Amz-Signature=secret-signed&X-Amz-Credential=secret-credential'},headers:{cookie:'session=secret-cookie'}};
  store.recordBatch({id:'secret-1',source,status:'success',request:{url:'https://api.example/list?key=secret-query',headers:{Authorization:'Bearer secret-header'}},response,items:[]});
  store.recordBatch({id:'secret-2',source,status:'success',response,items:[]});
  const runs=db.prepare('select request_json,response_hash from collection_runs order by id').all() as {request_json:string;response_hash:string}[];
  assert.equal(runs[0].response_hash,runs[1].response_hash);
  const decoded=JSON.stringify(store.readBlob(runs[0].response_hash));
  for(const secret of ['secret-access','secret-url','secret-cookie','secret-query','secret-header','secret-client','secret-sms','secret-signed','secret-credential']) assert.equal((decoded+runs[0].request_json).includes(secret),false);
  assert.ok(decoded.includes('有效新闻'));
 }finally{db.close();}
});

test('oversized raw responses are explicitly truncated and invalid observation times are rejected',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db,{maxBlobBytes:256});
 try{
  store.recordBatch({id:'big',source,status:'partial',response:'文'.repeat(1000),items:[]});
  const row=db.prepare('select response_hash,response_truncated from collection_runs where id=?').get('big') as {response_hash:string;response_truncated:number};
  assert.equal(row.response_truncated,1);assert.ok(Buffer.byteLength(String(store.readBlob(row.response_hash)))<=256);
  assert.throws(()=>store.recordBatch({source,status:'success',observedAt:'not-a-date',items:[story]}),/time|时间/i);
  assert.equal(count(db,'collection_runs'),1);
 }finally{db.close();}
});

test('platform object IDs can gain URL aliases without merging different platform documents',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  const first=store.recordBatch({id:'alias-1',source,status:'success',items:[{...story,platformId:'90071992547409931234'}]});
  const second=store.recordBatch({id:'alias-2',source,status:'success',items:[{...story,url:'https://m.news.example/story/7',platformId:'90071992547409931234'}]});
  store.recordBatch({id:'alias-3',source:{...source,platform:'zhihu'},status:'success',items:[story]});
  assert.equal(first.documentIds[0],second.documentIds[0]);assert.equal(count(db,'library_documents'),2);
 }finally{db.close();}
});

test('malformed response text still scrubs quoted credentials and camel-case token fields',()=>{
 const db=new Database(':memory:');const store=new EvidenceStore(db);
 try{
  store.recordBatch({id:'broken-secret',source,status:'failed',response:'{"access_token":"hidden-auth", "csrfToken":"hidden-csrf", broken',items:[]});
  const row=db.prepare('select response_hash from collection_runs').get() as {response_hash:string};
  const text=String(store.readBlob(row.response_hash));
  assert.equal(text.includes('hidden-auth'),false);assert.equal(text.includes('hidden-csrf'),false);
 }finally{db.close();}
});
