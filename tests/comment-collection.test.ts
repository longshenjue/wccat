import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {resolveCommentThread,normalizeComments} from '../src/lib/comments/adapters';
import {CommentCollector} from '../src/lib/comments/collector';
import {advanceGeneration,acquireMaintenance,releaseMaintenance} from '../src/lib/maintenance';

const occurrence=(sourceId:string,url:string)=>({sourceId,url});
const thread=()=>resolveCommentThread(occurrence('bilibili','https://www.bilibili.com/video/av123'))!;
const payload=(n=30)=>({code:0,data:{replies:Array.from({length:n},(_,i)=>({rpid_str:String(i+1),like:i,content:{message:'这是实际采集到的评论 '+i},replies:[{rpid:999,content:{message:'不要采集楼中楼'}}]})),hots:[{rpid:998,content:{message:'不要额外收集置顶'}}]}});
function setup(fetcher:typeof fetch,limit=100){
 const db=new Database(':memory:');let now=Date.parse('2026-11-24T01:00:00Z');
 const collector=new CommentCollector(db,{fetch:fetcher,now:()=>now,sleep:async ms=>{now+=ms;},dailyLimit:limit});
 return {db,collector,advance:(ms:number)=>{now+=ms;}};
}
test('only recognized content URLs resolve; searches, mismatched sources and hostile hosts are skipped',()=>{
 for(const item of [occurrence('weibo','https://s.weibo.com/weibo?q=test'),occurrence('bilibili','https://www.bilibili.com.evil.test/video/av123'),occurrence('bilibili','http://127.0.0.1/video/av123'),occurrence('baidu','https://www.zhihu.com/question/123'),occurrence('zhihu','https://www.zhihu.com/search?q=123'),occurrence('zhihu','https://user:password@www.zhihu.com/question/123')])assert.equal(resolveCommentThread(item),undefined);
 assert.ok(resolveCommentThread(occurrence('bilibili','https://www.bilibili.com/video/BV1xx411c7mD'))?.bvid);
 assert.equal(resolveCommentThread(occurrence('bilibili','https://b23.tv/BV1kZWX62ENY'))?.articleUrl,'https://www.bilibili.com/video/BV1kZWX62ENY');
 assert.match(resolveCommentThread(occurrence('zhihu','https://www.zhihu.com/question/123/answer/456'))!.apiUrl!,/answers\/456\/root_comment/);
 assert.match(resolveCommentThread(occurrence('weibo','https://m.weibo.cn/detail/123456'))!.apiUrl!,/hotflow/);
});
test('only first 20 root comments are normalized, identities/provenance retained, nested/pinned content excluded',()=>{
 const items=normalizeComments(thread(),payload(),'2026-11-24T01:00:00Z');
 assert.equal(items.length,20);assert.equal(items[0].id,'bilibili:1');assert.equal(items[19].likes,19);
 assert.equal(items.some(c=>c.text.includes('楼中楼')),false);assert.equal(items[0].articleUrl,thread().articleUrl);
 assert.equal(items[0].observedAt,'2026-11-24T01:00:00Z');
});
test('Bilibili plain-text comparison signs and line breaks remain verbatim',()=>{
 const text='支持 A < B，但是反对 C > D 的评价\n请看完整证据。';
 const value=normalizeComments(thread(),{code:0,data:{replies:[{rpid:1,like:5,content:{message:text}}]}},'2026-11-24T01:00:00Z');
 assert.equal(value[0].text,text);
});
test('HTML-bearing comment providers preserve visible emoji labels that can change the attitude',()=>{
 const t=resolveCommentThread(occurrence('weibo','https://m.weibo.cn/detail/123456'))!;
 const result=normalizeComments(t,{ok:1,data:{data:[{id:'77',text:'这操作可真是太好了<img alt="[doge]" src="https://example.test/emoji.png">',like_count:8}]}},'2026-11-24T01:00:00Z');
 assert.equal(result[0].text,'这操作可真是太好了[doge]');
});
test('collect at most two distinct threads, request first-page likes sort, cache samples for four hours',async()=>{
 const urls:string[]=[];const ctx=setup(async(url,init)=>{urls.push(String(url));assert.equal(init?.redirect,'error');const body=payload();for(const r of body.data.replies)r.rpid_str=String(Number(new URL(String(url)).searchParams.get('oid'))*100+Number(r.rpid_str));return Response.json(body);});
 try{
  const input=[occurrence('bilibili',thread().articleUrl),occurrence('bilibili',thread().articleUrl),occurrence('bilibili','https://www.bilibili.com/video/av456'),occurrence('bilibili','https://www.bilibili.com/video/av789')];
  const first=await ctx.collector.collect(input);assert.equal(first.comments.length,40);assert.equal(urls.length,2);
  assert.equal(new URL(urls[0]).searchParams.get('sort'),'1');assert.equal(new URL(urls[0]).searchParams.get('pn'),'1');assert.equal(new URL(urls[0]).searchParams.get('ps'),'20');
  ctx.advance(1000);const cached=await ctx.collector.collect(input);assert.equal(urls.length,2);assert.deepEqual(cached,first);
  assert.ok(ctx.db.prepare("select id from collection_runs where status='success'").get());
  ctx.advance(4*3600_000);await ctx.collector.collect(input);assert.equal(urls.length,4);
 }finally{ctx.db.close();}
});
test('HTTP failures and API refusals return no comments, with cooldown and no immediate retry',async()=>{
 for(const response of [()=>new Response('no',{status:403}),()=>Response.json({code:-352,data:null}),()=>Response.json({code:0,data:{replies:null}}),()=>new Response('{invalid')]){
  let calls=0;const ctx=setup(async()=>{calls++;return response();});
  try{assert.equal((await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)])).comments.length,0);await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)]);assert.equal(calls,1);}finally{ctx.db.close();}
 }
});
test('global daily network cap counts BV lookup too and is shared across collector instances',async()=>{
 let calls=0;const ctx=setup(async url=>{calls++;return String(url).includes('/view?')?Response.json({code:0,data:{aid:123}}):Response.json(payload());},1);
 try{
  const first=await ctx.collector.collect([occurrence('bilibili','https://www.bilibili.com/video/BV1xx411c7mD')]);assert.equal(calls,1);assert.equal(first.comments.length,0);
  const other=new CommentCollector(ctx.db,{fetch:async()=>{calls++;return Response.json(payload());},dailyLimit:1,now:()=>Date.parse('2026-11-24T01:10:00Z'),sleep:async()=>{}});
  await other.collect([occurrence('bilibili','https://www.bilibili.com/video/av777')]);assert.equal(calls,1);
 }finally{ctx.db.close();}
});
test('oversized responses and fetch timeouts are suppressed; old successes are not presented as fresh after expiry',async()=>{
 let mode=0;const ctx=setup(async()=>{if(mode===1)return new Response('x'.repeat(530000));if(mode===2)throw new DOMException('timed out','TimeoutError');return Response.json(payload());});
 try{
  assert.equal((await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)])).comments.length,20);
  ctx.advance(4*3600_000+1000);mode=1;assert.equal((await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)])).comments.length,0);
  ctx.advance(6*3600_000);mode=2;assert.equal((await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)])).comments.length,0);
 }finally{ctx.db.close();}
});
test('maintenance generation fences delayed comment writes',async()=>{
 const ctx=setup(async()=>{acquireMaintenance(ctx.db,'test');advanceGeneration(ctx.db,'test');releaseMaintenance(ctx.db,'test');return Response.json(payload());});
 try{await assert.rejects(ctx.collector.collect([occurrence('bilibili',thread().articleUrl)]),/数据版本/);}finally{ctx.db.close();}
});
test('a failed refresh of a week-old success retains its new negative cache',async()=>{
 let calls=0,fail=false;const ctx=setup(async()=>{calls++;return fail?new Response('unavailable',{status:403}):Response.json(payload());});
 try{
  await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)]);ctx.advance(8*86400_000);fail=true;
  await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)]);const attempts=calls;
  await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)]);assert.equal(calls,attempts);
 }finally{ctx.db.close();}
});
test('comments that would be changed by evidence redaction are omitted rather than rewritten as quotes',async()=>{
 const ctx=setup(async()=>Response.json({code:0,data:{replies:[{rpid:1,like:10,content:{message:'请使用 password=secret-token 完成验证'}}]}}));
 try{assert.deepEqual((await ctx.collector.collect([occurrence('bilibili',thread().articleUrl)])).comments,[]);}finally{ctx.db.close();}
});
