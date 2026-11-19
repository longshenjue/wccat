import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {ProviderState} from '../src/lib/provider-state';
import {TianApiClient,readTianApiConfig} from '../src/lib/tianapi/client';
import {TIANAPI_ENDPOINTS} from '../src/lib/tianapi/catalog';

const key='private-tianapi-fixture-83a2';
const fixtures={
 networkhot:{title:'测试事件',digest:'聚合来源的事件简介',hotnum:42},
 weibohot:{hotword:'测试事件',hotwordnum:'0',hottag:'热'},
 nethot:{keyword:'测试事件',brief:'百度事件简介',index:'1.2万',trend:'rise'},
 toutiaohot:{word:'测试事件',hotindex:42},
 wxhottopic:{word:'测试事件',index:9},
 douyinhot:{word:'测试事件',hotindex:42,label:3}
};
function setup(responder:(url:string,init?:RequestInit)=>Promise<Response>,limit=90) {
 const db=new Database(':memory:'),state=new ProviderState(db);let now=Date.parse('2026-11-19T03:00:00Z');
 const config=readTianApiConfig({TIANAPI_KEY:key,TIANAPI_DAILY_LIMIT:String(limit)})!;
 const client=new TianApiClient(state,config,{now:()=>now,sleep:async ms=>{now+=ms;},fetch:async(url,init)=>responder(String(url),init)});
 return {db,state,client,advance:(ms:number)=>{now+=ms;}};
}

test('six actual request paths normalize official envelopes without inventing interactions or Tencent heat',async()=>{
 const paths:string[]=[];
 const ctx=setup(async(url,init)=>{
  paths.push(new URL(url).pathname);assert.equal(new URL(url).search,'');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
  assert.equal(new URLSearchParams(String(init?.body)).get('key'),key);
  const endpoint=new URL(url).pathname.split('/')[1] as keyof typeof fixtures;
  return Response.json({code:200,msg:'success',result:{list:[fixtures[endpoint]]}});
 });
 try{
  const results=[];for(const endpoint of TIANAPI_ENDPOINTS)results.push((await ctx.client.fetch(endpoint))!);
  assert.deepEqual(paths,['/networkhot/index','/weibohot/index','/nethot/index','/toutiaohot/index','/wxhottopic/index','/douyinhot/index']);
  assert.deepEqual(results.map(r=>r.items[0].sourceId),['tianapi-network','weibo','baidu','toutiao','tencent-hot','douyin']);
  assert.equal(results[1].items[0].heatValue,0);assert.equal(results[2].items[0].heatValue,12000);assert.equal(results[4].items[0].heatValue,undefined);
  for(const result of results){assert.equal(result.items[0].contentType,'topic');assert.equal(result.items[0].stats,undefined);assert.equal(result.batch.source.provider,'tianapi');assert.equal(result.batch.status,'success');assert.equal(JSON.stringify(result).includes(key),false);}
 }finally{ctx.db.close();}
});

test('cached responses retain source time and an exhausted daily limit does not send another request',async()=>{
 let calls=0;const ctx=setup(async()=>{calls++;return Response.json({code:200,msg:'success',result:{list:[fixtures.weibohot]}});},1);
 try{
  const first=(await ctx.client.fetch('weibohot'))!;ctx.advance(1000);const cached=(await ctx.client.fetch('weibohot'))!;
  assert.equal(calls,1);assert.equal(cached.batch.cached,true);assert.equal(cached.batch.observedAt,first.batch.observedAt);assert.equal(cached.items[0].fetchedAt,first.items[0].fetchedAt);
  ctx.advance(1800000);const limited=(await ctx.client.fetch('weibohot'))!;
  assert.equal(calls,1);assert.equal(limited.items.length,0);assert.match(limited.batch.error??'',/daily-limit/);
 }finally{ctx.db.close();}
});

test('HTTP200 API refusal, invalid JSON and missing result list are failed attempts with cooldown',async()=>{
 for(const body of [{code:160,msg:'not authorized '+key},'{broken',{code:200,msg:'success',result:{}}]){
  let calls=0;const ctx=setup(async()=>{calls++;return new Response(typeof body==='string'?body:JSON.stringify(body));});
  try{const result=(await ctx.client.fetch('weibohot'))!;assert.equal(result.batch.status,'failed');assert.equal(result.items.length,0);assert.equal(JSON.stringify(result).includes(key),false);
   await ctx.client.fetch('weibohot');assert.equal(calls,1);
  }finally{ctx.db.close();}
 }
});

test('oversized payloads are bounded and response echo secrets never enter the cache or evidence',async()=>{
 const large=setup(async()=>new Response('a'.repeat(2100000)));
 try{const result=(await large.client.fetch('weibohot'))!;assert.equal(result.batch.status,'failed');assert.equal(result.batch.responseTruncated,true);}finally{large.db.close();}
 const safe=setup(async()=>Response.json({code:200,msg:'success',echo:key,result:{list:[fixtures.weibohot]}}));
 try{const result=(await safe.client.fetch('weibohot'))!;assert.equal(JSON.stringify(result).includes(key),false);
  const rows=safe.db.prepare('select cache_json,last_error from provider_request_state').all();assert.equal(JSON.stringify(rows).includes(key),false);
 }finally{safe.db.close();}
});

test('configuration disables missing keys, validates endpoint allowlist and cannot exceed free cap',()=>{
 assert.equal(readTianApiConfig({}),undefined);assert.equal(readTianApiConfig({TIANAPI_KEY:key,TIANAPI_ENABLED:'false'}),undefined);
 assert.throws(()=>readTianApiConfig({TIANAPI_KEY:key,TIANAPI_DAILY_LIMIT:'101'}),/1.*100/);
 assert.throws(()=>readTianApiConfig({TIANAPI_KEY:key,TIANAPI_ENDPOINTS:'weibohot,unknown'}),/unknown/);
 const ctx=setup(async()=>{throw new Error('disabled endpoint must not call network');});
 try{const restricted=new TianApiClient(ctx.state,readTianApiConfig({TIANAPI_KEY:key,TIANAPI_ENDPOINTS:'weibohot'})!);assert.equal(restricted.enabled('nethot'),false);}finally{ctx.db.close();}
});
