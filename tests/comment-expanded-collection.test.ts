import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {CommentCollector} from '../src/lib/comments/collector';
import {visibleCommentQuotes} from '../src/lib/comments/selection';

function setup(fetcher:typeof fetch, dailyLimit=100){
 const db=new Database(':memory:');let now=Date.parse('2026-11-24T09:00:00Z');
 return {db,collector:new CommentCollector(db,{fetch:fetcher,dailyLimit,now:()=>now,sleep:async ms=>{now+=ms;}})};
}
const paper={sourceId:'thepaper',url:'https://www.thepaper.cn/newsDetail_forward_34458875'};
const netease={sourceId:'netease-news',url:'https://www.163.com/dy/article/LBJP2QG805118DFD.html'};
const qq={sourceId:'qq-news',url:'https://new.qq.com/rain/a/20261112A0B42W00'};
test('fixed POST comment requests publish short real comments and cache without another request',async()=>{
 let calls=0;const ctx=setup(async(url,init)=>{
  calls++;assert.equal(String(url),'https://api.thepaper.cn/comment/news/comment/talkList');
  assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init.body)),{contId:'34458875',contType:0,pageNum:1,pageSize:10});
  assert.equal(init?.redirect,'error');
  return Response.json({code:200,data:{list:[{commentId:45342188,content:'要重罚！',praiseTimes:'9'}]}});
 });
 try{const result=await ctx.collector.collect([paper]);assert.equal(result.comments[0]?.text,'要重罚！');assert.equal(result.comments[0].likes,9);await ctx.collector.collect([paper]);assert.equal(calls,1);}finally{ctx.db.close();}
});
test('article metadata requests count toward the shared cap and cannot displace later supported-source results',async()=>{
 const urls:string[]=[];const ctx=setup(async url=>{
  urls.push(String(url));if(String(url)===netease.url)return new Response('<script>var tie={"productKey":"a2869674571f77b5a0867c3d71db5856","docId":"LBJP2QG805118DFD"}</script>');
  return Response.json({ret:0,comments:{new:[[{reply_id:'1001',reply_content:'这是一条腾讯新闻评论',agree_count:8}]]}});
 },2);
 try{const result=await ctx.collector.collect([qq,netease]);assert.equal(result.comments.length,1);assert.equal(result.comments[0].sourceId,'qq-news');assert.equal(urls.length,2);assert.equal(urls[1],netease.url);}finally{ctx.db.close();}
});
test('bad article metadata never becomes a request URL, while another source still succeeds',async()=>{
 const urls:string[]=[];const ctx=setup(async url=>{urls.push(String(url));if(String(url)===netease.url)return new Response('{"productKey":"https://127.0.0.1/private","docId":"LBJP2QG805118DFD"}');return Response.json({code:200,data:{list:[{commentId:1,content:'要重罚！',praiseTimes:9}]}});});
 try{const result=await ctx.collector.collect([netease,paper]);assert.equal(result.comments.length,1);assert.equal(result.comments[0].sourceId,'thepaper');assert.equal(urls.length,2);assert.ok(urls.every(url=>!url.includes('127.0.0.1')));}finally{ctx.db.close();}
});
test('quotes collected from actual Tieba threads can be displayed without treating topic IDs as post IDs',()=>{
 const battle={redLabel:'支持',blueLabel:'反对'},quote={id:'tieba:100:200',text:'这是原帖下的真实评论',sourceId:'tieba',sourceName:'贴吧',articleUrl:'https://tieba.baidu.com/p/100',url:'https://tieba.baidu.com/p/100',likes:7,rank:1,observedAt:'2026-11-24T09:00:00Z'};
 const examples={...battle,red:quote,sampleCount:1,sampledAt:quote.observedAt,runIds:[]};
 assert.equal(visibleCommentQuotes(examples,battle,'zh').length,1);
 assert.equal(visibleCommentQuotes({...examples,red:{...quote,url:'https://tieba.baidu.com/p/999'}},battle,'zh').length,0);
 assert.equal(visibleCommentQuotes({...examples,red:{...quote,articleUrl:'https://tieba.baidu.com.evil.test/p/100'}},battle,'zh').length,0);
});
test('Huxiu hot-to-latest fallback shares quota, persists real zero likes and uses the cache',async()=>{
 const types:string[]=[];const ctx=setup(async(_url,init)=>{
  const type=new URLSearchParams(String(init?.body)).get('type')!;types.push(type);
  assert.equal(new Headers(init?.headers).get('content-type'),'application/x-www-form-urlencoded');
  return Response.json({success:true,data:{datalist:type==='1'?[]:[{comment_id:3834972,content:'民主党多名议员ok',agree_num:0,parent_comment_id:0,to_comment_id:0}]}});
 },2);
 const input=[{sourceId:'huxiu',url:'https://www.huxiu.com/moment/1299525.html'}];
 try{const result=await ctx.collector.collect(input);assert.deepEqual(types,['1','2']);assert.equal(result.comments.length,1);assert.equal(result.comments[0].likes,0);await ctx.collector.collect(input);assert.equal(types.length,2);assert.equal((await ctx.collector.collect([paper])).comments.length,0);assert.equal(types.length,2);}finally{ctx.db.close();}
});
test('refused hot-list requests and exhausted fallback quota never cause extra requests or publish empty examples',async()=>{
 for(const mode of ['refused','budget'] as const){
  let calls=0;const ctx=setup(async()=>{calls++;return Response.json(mode==='refused'?{success:false,error:{message:'denied'}}:{success:true,data:{datalist:[]}});},1);
  try{const input=[{sourceId:'huxiu',url:'https://www.huxiu.com/moment/1299525.html'}];assert.equal((await ctx.collector.collect(input)).comments.length,0);assert.equal(calls,1);await ctx.collector.collect(input);assert.equal(calls,1);}finally{ctx.db.close();}
 }
});
test('new provider access refusals keep the six-hour negative cache',async()=>{
 const db=new Database(':memory:');let now=Date.parse('2026-11-24T09:00:00Z'),calls=0;
 const collector=new CommentCollector(db,{fetch:async()=>{calls++;return Response.json({code:403});},now:()=>now,sleep:async ms=>{now+=ms;}});
 const input=[{sourceId:'hupu',url:'https://bbs.hupu.com/643288637.html'}];
 try{await collector.collect(input);now+=3600_000;await collector.collect(input);assert.equal(calls,1);now+=6*3600_000;await collector.collect(input);assert.equal(calls,2);}finally{db.close();}
});
test('Toutiao resolves one original post and cancels the feed before reading its remaining posts',async()=>{
 let pulls=0,cancelled=false;const urls:string[]=[];
 const ctx=setup(async url=>{
  urls.push(String(url));
  if(String(url).includes('topic_innerflow'))return new Response(new ReadableStream({
   pull(controller){pulls++;controller.enqueue(new TextEncoder().encode(pulls===1?'{"data":[{"content":"{\\"share_url\\":\\"https://m.toutiao.com/w/1882699991898124/?from=topic\\"}"}':',{"content":"'+'x'.repeat(600000)));},
   cancel(){cancelled=true;}
  },{highWaterMark:0}));
  const target=new URL(String(url));assert.equal(target.searchParams.get('group_id'),'1882699991898124');assert.equal(target.searchParams.get('count'),'20');
  return Response.json({message:'success',data:[{comment:{id_str:'7711648088742019859',text:'@豆包 925这事是真的吗',digg_count:0}}]});
 });
 try{const result=await ctx.collector.collect([{sourceId:'toutiao',url:'https://www.toutiao.com/trending/7711268741400497707/'}]);assert.equal(result.comments.length,1);assert.equal(pulls,1);assert.equal(cancelled,true);assert.equal(urls.length,2);assert.equal(result.comments[0].articleUrl,'https://m.toutiao.com/w/1882699991898124/');assert.equal(result.comments[0].likes,0);}finally{ctx.db.close();}
});
