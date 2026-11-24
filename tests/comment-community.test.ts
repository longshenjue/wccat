import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCommunityThread,normalizeCommunityComments} from '../src/lib/comments/community';
import type {CommentThread} from '../src/lib/comments/types';
const at='2026-11-24T01:00:00Z';
const fixture=(source:string)=>JSON.parse(readFileSync(new URL('./fixtures/comments/community-'+source+'.json',import.meta.url),'utf8'));
const thread=(sourceId:string,url:string)=>resolveCommunityThread({sourceId,url})!;
const hupu=()=>thread('hupu','https://bbs.hupu.com/643288637.html');
const douban=()=>thread('douban','https://www.douban.com/group/topic/504999396/');
const tieba=()=>thread('tieba','https://tieba.baidu.com/hottopic/browse/hottopic?topic_id=28369796');

test('community URLs resolve only their verified hosts and content paths to fixed APIs',()=>{
 assert.equal(hupu().threadId,'643288637');
 assert.equal(hupu().apiUrl,'https://bbs.hupu.com/api/v2/threads?tid=643288637');
 assert.equal(douban().apiUrl,'https://m.douban.com/rexxar/api/v2/group/topic/504999396/comments?start=0&count=20&sort=hot');
 assert.equal(thread('douban','https://m.douban.com/group/topic/504999396/?tracking=1').key,douban().key);
 assert.equal(tieba().threadId,'28369796');
 const api=new URL(tieba().apiUrl!);assert.equal(api.hostname,'tieba.baidu.com');assert.equal(api.pathname,'/c/f/hottopic/topicDetail');
 assert.equal(api.searchParams.get('pn'),'1');assert.equal(api.searchParams.get('topic_id'),'28369796');assert.equal(api.searchParams.get('_client_type'),'2');
 for(const [sourceId,url] of [
  ['hupu','https://bbs.hupu.com.evil.test/643288637.html'],['hupu','https://user:pass@bbs.hupu.com/643288637.html'],
  ['hupu','http://bbs.hupu.com/643288637.html'],['hupu','https://bbs.hupu.com:444/643288637.html'],['hupu','https://bbs.hupu.com/all-gambia'],
  ['douban','https://movie.douban.com/subject/504999396/'],['douban','https://www.douban.com/group/explore'],
  ['tieba','https://tieba.baidu.com/p/28369796'],['tieba','https://tieba.baidu.com/hottopic/browse/hottopic?topic_id=1&topic_id=2'],
  ['tieba','https://tieba.baidu.com/hottopic/browse/hottopic?topic_id=0'],['weibo','https://bbs.hupu.com/643288637.html'],
 ])assert.equal(resolveCommunityThread({sourceId,url}),undefined,url);
});
test('Hupu light comments preserve their own words, scope IDs by thread, and exclude quotes',()=>{
 const value=fixture('hupu');value.data.lights[0].quote={content:'这不是当前作者说的话'};
 const result=normalizeCommunityComments(hupu(),value,at)!;
 assert.equal(result.length,2);assert.equal(result[0].id,'hupu:643288637:122136');assert.equal(result[0].likes,775);
 assert.equal(result.some(x=>x.text.includes('不是当前作者')),false);assert.equal(result[0].observedAt,at);assert.equal(result[0].articleUrl,'https://bbs.hupu.com/643288637.html');
 const other={...hupu(),threadId:'999'};assert.notEqual(normalizeCommunityComments(other,value,at)![0].id,result[0].id);
});
test('community text preserves emoji, short comments, and comparisons while rejecting unavailable content',()=>{
 const rows=[
  {pid:'1',content:'<p>要重罚！</p>',count:'7'},
  {pid:'2',content:'<p>A &lt; B<img alt="[doge]" src="x"></p>',allLightCount:3},
  {pid:'3',content:'<p>不可公开评论</p>',isHidden:true},
  {pid:'4',content:'<p>不可公开评论</p>',isDelete:true},
  {pid:'5',content:'<p>不可公开评论</p>',isAudit:true},
  {pid:'6',content:'<p>'+('长'.repeat(601))+'</p>'},
  {pid:'7',content:'好'},
  {pid:'8',content:'<script>alert(1)</script><p>自己的话</p>'},
 ];
 const result=normalizeCommunityComments(hupu(),{code:200,data:{lights:rows}},at)!;
 assert.deepEqual(result.map(x=>x.text),['要重罚！','A < B[doge]','自己的话']);assert.equal(result[0].likes,7);
 assert.equal(result[2].likes,undefined);
});
test('Douban merges popular comments first and deduplicates roots without collecting nested replies',()=>{
 const value=fixture('douban');const popular=value.popular_comments[0];
 value.comments.unshift({...popular,replies:[{id:'999',text:'嵌套回复不采集'}]});
 const result=normalizeCommunityComments(douban(),value,at)!;
 assert.equal(result[0].id,'douban:'+popular.id);assert.equal(result[0].likes,popular.vote_count);
 assert.equal(result.filter(x=>x.id==='douban:'+popular.id).length,1);assert.equal(result.some(x=>x.text.includes('嵌套')),false);
});
test('community comments cap twenty unique rows and never turn missing or invalid likes into zero',()=>{
 const comments=Array.from({length:35},(_,i)=>({id:String(i+1),text:'真实评论 '+i,vote_count:i===0?'12':i===1?'':i===2?-1:i===3?1.5:undefined}));
 const result=normalizeCommunityComments(douban(),{popular_comments:[],comments},at)!;
 assert.equal(result.length,20);assert.equal(result[0].likes,12);assert.deepEqual(result.slice(1,5).map(x=>x.likes),[undefined,undefined,undefined,undefined]);
 assert.deepEqual(result.map(x=>x.rank),Array.from({length:20},(_,i)=>i+1));
});
test('Tieba uses the first actual thread hot posts, validates parent tid, and links its original thread',()=>{
 const value=fixture('tieba');const cards=value.area_card_list[0].card_data;
 const original=cards[0].data.thread_info;original.hot_post_list[0].content.push({type:2,text:'[滑稽]'});
 original.hot_post_list.push({...original.hot_post_list[0],id:123,tid:111});
 cards.unshift({data:{thread_info:{tid:123,title:'原帖标题不是评论',abstract:'原帖摘要不是评论'}}});
 const result=normalizeCommunityComments(tieba(),value,at)!;
 assert.equal(result.length,1);assert.equal(result[0].articleUrl,'https://tieba.baidu.com/p/11190155384');assert.equal(result[0].url,result[0].articleUrl);
 assert.equal(result[0].likes,650);assert.ok(result[0].text.endsWith('[滑稽]'));assert.equal(result[0].id,'tieba:'+original.hot_post_list[0].id);
 assert.equal(result.some(x=>x.text.includes('原帖')),false);
});
test('community APIs distinguish true empty lists from refusals or missing response structure',()=>{
 assert.deepEqual(normalizeCommunityComments(hupu(),{code:200,data:{lights:[]}},at),[]);
 assert.deepEqual(normalizeCommunityComments(douban(),{comments:[],popular_comments:[]},at),[]);
 assert.deepEqual(normalizeCommunityComments(tieba(),{error_code:0,area_card_list:[{card_data:[]}]},at),[]);
 const failures:Array<[CommentThread,unknown]>=[[hupu(),{code:403,data:{lights:[]}}],[hupu(),{code:200,data:{}}],[douban(),{error:'login_required'}],[tieba(),{error_code:0,area_card_list:[{area_type:'content'}]}]];
 for(const [t,value] of failures)assert.throws(()=>normalizeCommunityComments(t,value,at));
 assert.equal(normalizeCommunityComments({...hupu(),sourceId:'weibo'},null,at),undefined);
});

test('Douban plain text preserves line breaks, comparison notation and literal entities',()=>{
 const text='  第一行 <abc> 与 A < B\n第二行  保留间隔 &amp; 标记  ';
 const result=normalizeCommunityComments(douban(),{popular_comments:[],comments:[{id:'901',text,vote_count:3}]},at)!;
 assert.equal(result[0].text,'第一行 <abc> 与 A < B\n第二行  保留间隔 &amp; 标记');
});
test('Hupu inline blockquotes omit the whole comment instead of silently editing its visible words',()=>{
 const result=normalizeCommunityComments(hupu(),{code:200,data:{lights:[
  {pid:'1',content:'<blockquote>引用的话</blockquote><p>自己的回应</p>'},
  {pid:'2',content:'<BLOCKQUOTE class="quote">引用未闭合<p>自己的回应</p>'},
  {pid:'3',content:'<p>只保留完整作者评论</p>',quote:{content:'独立引用不应混入'}},
 ]}},at)!;
 assert.deepEqual(result.map(x=>x.id),['hupu:643288637:3']);
 assert.equal(result[0].text,'只保留完整作者评论');
});
