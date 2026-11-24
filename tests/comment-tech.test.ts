import test from 'node:test';
import assert from 'node:assert/strict';
import ithome from './fixtures/tech/ithome.json';
import huxiu from './fixtures/tech/huxiu.json';
import {resolveTechThread,metadataURL,resolveTechRequest,normalizeTechComments,fallbackTechRequest} from '../src/lib/comments/tech';

const observed='2026-11-24T01:00:00Z';
const it=()=>resolveTechThread({sourceId:'ithome',url:'https://www.ithome.com/0/1030/120.htm'})!;
const hx=()=>resolveTechThread({sourceId:'huxiu',url:'https://www.huxiu.com/moment/1299525.html'})!;
const html='<script>var newsInfo = {NewsIDDes: "3a259e77109500b6", LapinIDDes: "", PostDate: "2026-11-20 16:43:27"};</script>';

test('tech content resolution rejects hostile hosts and unverified Huxiu article routes',()=>{
  assert.equal(it().threadId,'1030120');
  assert.equal(resolveTechThread({sourceId:'ithome',url:'https://m.ithome.com/html/1030120.htm'})?.key,it().key);
  assert.equal(hx().threadId,'1299525');
  for(const item of [
    {sourceId:'ithome',url:'https://m.ithome.com.evil.test/html/1030120.htm'},
    {sourceId:'ithome',url:'https://user:secret@m.ithome.com/html/1030120.htm'},
    {sourceId:'ithome',url:'https://m.ithome.com:8443/html/1030120.htm'},
    {sourceId:'ithome',url:'https://m.ithome.com/rankm/'},
    {sourceId:'huxiu',url:'https://www.huxiu.com/article/1299525.html'},
    {sourceId:'36kr',url:'https://www.36kr.com/p/4067443683120000'}
  ])assert.equal(resolveTechThread(item),undefined);
});
test('IT之家 metadata resolution reads fixed mobile host and keeps opaque ID/date values as data',async()=>{
  assert.equal(metadataURL(it()),'https://m.ithome.com/html/1030120.htm');
  const seen:string[]=[];
  const request=await resolveTechRequest(it(),async url=>{seen.push(url);return html;});
  assert.deepEqual(seen,['https://m.ithome.com/html/1030120.htm']);
  const url=new URL(request!.url);
  assert.equal(url.origin,'https://m.ithome.com');assert.equal(url.pathname,'/api/comment/newscommentlistget');
  assert.equal(url.searchParams.get('NewsID'),'3a259e77109500b6');
  assert.equal(url.searchParams.get('PostDate'),'2026-11-20 16:43:27');
  assert.equal(url.searchParams.get('MaxCommentID'),'0');
  await assert.rejects(resolveTechRequest(it(),async()=>'<script>var newsInfo = {NewsIDDes: ""}; throw Error("never execute");</script>'),/metadata|ID/i);
});
test('IT之家 imports only bounded hot root comments with true support counts and stable provenance',()=>{
  const result=normalizeTechComments(it(),ithome,observed)!;
  assert.equal(result.length,2);assert.equal(result[0].id,'ithome:77449616');
  assert.equal(result[1].text,'[阴险笑]');
  assert.equal(result[0].text,'没有华为标卖五千五，给我一个不买 pxv 的理由');
  assert.equal(result[0].likes,793);assert.equal(result[0].articleUrl,it().articleUrl);
  assert.equal(result[0].observedAt,observed);
  const value={Success:1,Result:{Hlist:[{M:{Ci:1,C:'这是没有数字点赞的根评论',SF:'1楼'}},{M:{Ci:2,C:'不收缺乏上下文的楼中楼',SF:'1楼#2'}}],Clist:[{M:{Ci:3,C:'不要采普通列表评论'}}]}};
  const filtered=normalizeTechComments(it(),value,observed)!;
  assert.equal(filtered.length,1);assert.equal(filtered[0].likes,undefined);
});
test('tech HTML conversion retains emoji labels and comparison signs while excluding script text',()=>{
  const result=normalizeTechComments(it(),{Success:1,Result:{Hlist:[{M:{Ci:1,C:'A &lt; B<br>好极了<img alt="[doge]" src="x"><script>bad()</script>',S:0}}]}},observed)!;
  assert.equal(result[0].text,'A < B 好极了[doge]');assert.equal(result[0].likes,0);
});
test('Huxiu requests hot comments first and offers latest fallback only for structurally valid empty success',async()=>{
  const request=await resolveTechRequest(hx(),async()=>{throw Error('Huxiu needs no metadata read');});
  assert.equal(request!.url,'https://api-comment.huxiu.com/v3/index/commentList');
  assert.equal(request!.method,'POST');assert.equal(request!.contentType,'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(request!.body).get('object_type'),'8');
  assert.equal(new URLSearchParams(request!.body).get('object_id'),'1299525');
  assert.equal(new URLSearchParams(request!.body).get('type'),'1');
  const fallback=fallbackTechRequest(hx(),{success:true,data:{last_id:0,datalist:[]}})!;
  assert.equal(new URLSearchParams(fallback.body).get('type'),'2');
  for(const value of [{success:false,data:{datalist:[]}},{success:true,data:{}},huxiu])assert.equal(fallbackTechRequest(hx(),value),undefined);
  assert.equal(fallbackTechRequest(it(),{Success:1,Result:{Hlist:[]}}),undefined);
});
test('Huxiu actual latest root comment preserves zero likes and excludes nested/folded/reply rows',()=>{
  const result=normalizeTechComments(hx(),huxiu,observed)!;
  assert.equal(result.length,1);assert.equal(result[0].id,'huxiu:3834972');assert.equal(result[0].text,'民主党多名议员ok');assert.equal(result[0].likes,0);
  const base=huxiu.data.datalist[0];
  assert.deepEqual(normalizeTechComments(hx(),{success:true,data:{datalist:[{...base,parent_comment_id:42},{...base,is_fold:true}]}},observed),[]);
});
test('Huxiu excludes rows linked to another object or a different content type',()=>{
  const base=huxiu.data.datalist[0];
  const rows=[{...base,comment_id:1,object_id:1299526},{...base,comment_id:2,object_type:1},{...base,comment_id:3,object_id:'1299525',object_type:'8'}];
  const result=normalizeTechComments(hx(),{success:true,data:{datalist:rows}},observed)!;
  assert.deepEqual(result.map(row=>row.id),['huxiu:3']);
});
test('IT之家 and Huxiu preserve real short comments for downstream classification',()=>{
  const itResult=normalizeTechComments(it(),{Success:1,Result:{Hlist:[{M:{Ci:77449505,C:'没诚意',S:289,SF:'1楼'}}]}},observed)!;
  assert.equal(itResult[0]?.text,'没诚意');assert.equal(itResult[0]?.likes,289);
  const hxResult=normalizeTechComments(hx(),{success:true,data:{datalist:[{...huxiu.data.datalist[0],content:'要重罚！'}]}},observed)!;
  assert.equal(hxResult[0]?.text,'要重罚！');
});
test('tech API refusals and missing list structures fail; other source normalization stays delegated',()=>{
  assert.throws(()=>normalizeTechComments(it(),{Success:0},observed));
  assert.throws(()=>normalizeTechComments(it(),{Success:1,Result:{}},observed));
  assert.throws(()=>normalizeTechComments(hx(),{success:false,error:{message:'denied'}},observed));
  assert.throws(()=>normalizeTechComments(hx(),{success:true,data:{}},observed));
  assert.deepEqual(normalizeTechComments(it(),{Success:1,Result:{Hlist:[]}},observed),[]);
  assert.equal(normalizeTechComments({...it(),sourceId:'bilibili'},ithome,observed),undefined);
});
test('tech sampling bounds first-page roots, deduplicates IDs and keeps missing likes unknown',()=>{
  const rows=Array.from({length:25},(_,i)=>({M:{Ci:i+1,C:'第一屏里的足够长评论 '+i,S:i===0?'8':i,SF:`${i+1}楼`}}));
  rows[1]=rows[0];
  const result=normalizeTechComments(it(),{Success:1,Result:{Hlist:rows}},observed)!;
  assert.equal(result.length,19);assert.equal(result[0].likes,undefined);
  assert.equal(result.at(-1)?.id,'ithome:20');
  assert.throws(()=>metadataURL({...it(),threadId:'../../evil.test'}),/ID/);
});
