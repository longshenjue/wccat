import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveNewsThread,resolveNewsRequest,normalizeNewsComments} from '../src/lib/comments/news';
const at='2026-11-24T09:46:32Z';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL('./fixtures/comments/news-'+name+'.json',import.meta.url),'utf8'));
const thread=(sourceId:string,url:string)=>resolveNewsThread({sourceId,url})!;
const paper=()=>thread('thepaper','https://www.thepaper.cn/newsDetail_forward_34458875');
const qq=()=>thread('qq-news','https://new.qq.com/rain/a/20261112A0B42W00');
const sina=()=>thread('sina-news','https://news.sina.com.cn/s/2026-11-11/doc-iniyixxy2059982.shtml');
const netease=()=>thread('netease-news','https://www.163.com/dy/article/LBJP2QG805118DFD.html');

test('news resolvers accept actual content URLs while rejecting hostile hosts, credentials, and nonarticle paths',()=>{
 assert.equal(paper().threadId,'34458875');assert.equal(qq().threadId,'20261112A0B42W00');assert.equal(netease().threadId,'LBJP2QG805118DFD');
 assert.equal(thread('thepaper','https://m.thepaper.cn/newsDetail_forward_34458875?from=share').key,paper().key);
 assert.equal(thread('qq-news','https://view.inews.qq.com/k/20261112A0B42W00').key,qq().key);
 for(const [sourceId,url] of [['thepaper','https://www.thepaper.cn.evil.test/newsDetail_forward_34458875'],['thepaper','http://www.thepaper.cn/newsDetail_forward_34458875'],['thepaper','https://u:p@www.thepaper.cn/newsDetail_forward_34458875'],['thepaper','https://www.thepaper.cn:444/newsDetail_forward_34458875'],['qq-news','https://new.qq.com/'],['sina-news','https://news.sina.com.cn/search'],['netease-news','https://www.163.com/dy/article/LBJP2QG805118DFD.html/extra'],['weibo','https://www.thepaper.cn/newsDetail_forward_34458875']])assert.equal(resolveNewsThread({sourceId,url}),undefined,url);
});
test('Paper posts the verified read-only JSON endpoint and QQ directly uses the article ID at service root',async()=>{
 const never=async()=>{throw new Error('unnecessary article fetch');};
 const p=await resolveNewsRequest(paper(),never);assert.equal(p?.url,'https://api.thepaper.cn/comment/news/comment/talkList');assert.equal(p?.method,'POST');assert.equal(p?.contentType,'application/json');assert.deepEqual(JSON.parse(p!.body!),{contId:'34458875',contType:0,pageNum:1,pageSize:10});
 const q=await resolveNewsRequest(qq(),never);const url=new URL(q!.url);assert.equal(url.origin+url.pathname,'https://r.inews.qq.com/getQQNewsComment');assert.equal(url.searchParams.get('article_id'),'20261112A0B42W00');assert.equal(url.searchParams.get('reqNum'),'10');assert.equal(url.searchParams.get('transparam'),'{}');
});
test('Sina and NetEase extract bounded metadata from HTML and construct only their fixed public API hosts',async()=>{
 const request=await resolveNewsRequest(sina(),async url=>{assert.equal(url,sina().articleUrl);return '<meta name="sudameta" content="comment_channel:sh;comment_id:comos-niyixxy2059982" />';});
 const s=new URL(request!.url);assert.equal(s.origin+s.pathname,'https://comment5.news.sina.com.cn/page/info');assert.equal(s.searchParams.get('channel'),'sh');assert.equal(s.searchParams.get('newsid'),'comos-niyixxy2059982');assert.equal(s.searchParams.get('page'),'1');
 const n=await resolveNewsRequest(netease(),async()=> '"productKey": "a2869674571f77b5a0867c3d71db5856",\n"docId": "LBJP2QG805118DFD", // original article');
 const nu=new URL(n!.url);assert.equal(nu.origin,'https://comment.api.163.com');assert.match(nu.pathname,/\/products\/a2869674571f77b5a0867c3d71db5856\/threads\/LBJP2QG805118DFD\/comments\/hotList$/);assert.equal(nu.searchParams.get('headLimit'),'1');assert.equal(nu.searchParams.get('tailLimit'),'0');
 const live=thread('sina-news','https://finance.sina.com.cn/7x24/2026-11-12/doc-iniykvcv2195621.shtml');const l=await resolveNewsRequest(live,async()=>"channel: 'live',\nnewsid: 'finance-152-5208749',");assert.equal(new URL(l!.url).searchParams.get('newsid'),'finance-152-5208749');
 for(const html of ['"productKey":"https://evil.test/","docId":"LBJP2QG805118DFD"','"productKey":"a2869674571f77b5a0867c3d71db5856","docId":"AAAAAAAAAAAAAAAA"'])await assert.rejects(resolveNewsRequest(netease(),async()=>html));
 await assert.rejects(resolveNewsRequest(sina(),async()=>"channel: 'sh', newsid: 'comos-niyixxy0000000',"));
});
test('real anonymized fixtures preserve short news comments, correct vote fields, and root comment provenance',()=>{
 const p=normalizeNewsComments(paper(),fixture('thepaper'),at)!;assert.equal(p.length,1);assert.equal(p[0].id,'thepaper:45342188');assert.equal(p[0].text,'要重罚！');assert.equal(p[0].likes,9);
 const q=normalizeNewsComments(qq(),fixture('qq'),at)!;assert.equal(q.length,10);assert.equal(q[0].id,'qq-news:7526588132361262777');assert.equal(q[1].likes,35);assert.equal(q[6].likes,undefined);
 const s=normalizeNewsComments(sina(),fixture('sina'),at)!;assert.equal(s.length,10);assert.equal(s[0].likes,14);assert.equal(s[1].likes,13);
 const n=normalizeNewsComments(netease(),fixture('netease'),at)!;assert.deepEqual(n.map(x=>x.text),['可惜了，人才','间谍实锤了']);assert.deepEqual(n.map(x=>x.likes),[0,0]);assert.equal(n[0].articleUrl,netease().articleUrl);assert.equal(n[0].observedAt,at);
});
test('news normalization ignores nested replies, deduplicates, rejects malformed IDs and text, and caps firstscreen candidates',()=>{
 const comments=Array.from({length:25},(_,i)=>({reply_id:String(i+1),reply_content:i===0?'A < B\n保留原话':'实际评论 '+i,agree_count:i,reply_list:[{reply_id:'999',reply_content:'不采集嵌套评论',agree_count:100}]}));
 const value={ret:0,comments:{new:comments.map(c=>[c]),count:25}};const out=normalizeNewsComments(qq(),value,at)!;assert.equal(out.length,20);assert.equal(out[0].text,'A < B\n保留原话');assert.equal(out.some(x=>x.text.includes('嵌套')),false);
 const likes=['12','',-1,1.5,'2x',' 2','9007199254740992',Number.MAX_SAFE_INTEGER+1,'0'];const rows=likes.map((v,i)=>({commentId:i+1,content:'评论原话',praiseTimes:v}));rows.push({...rows[0],content:'重复评论'});
 const result=normalizeNewsComments(paper(),{code:200,data:{list:rows}},at)!;assert.equal(result.length,9);assert.equal(result[0].likes,12);assert.deepEqual(result.slice(1,8).map(x=>x.likes),Array(7).fill(undefined));assert.equal(result[8].likes,0);
 const bad=[{commentId:1,content:'好'},{commentId:2,content:'长'.repeat(601)},{commentId:Number.MAX_SAFE_INTEGER+1,content:'错误编号'}];assert.deepEqual(normalizeNewsComments(paper(),{code:200,data:{list:bad}},at),[]);
});
test('news APIs distinguish genuine empty results from refusal, absent schema, and unrelated adapters',async()=>{
 assert.deepEqual(normalizeNewsComments(paper(),{code:200,data:{list:[]}},at),[]);assert.deepEqual(normalizeNewsComments(qq(),{ret:0,comments:{new:[]}},at),[]);assert.deepEqual(normalizeNewsComments(netease(),{commentIds:[],comments:{}},at),[]);assert.deepEqual(normalizeNewsComments(sina(),{result:{status:{code:0},hot_list:[],cmntlist:[]}},at),[]);
 for(const [t,value] of [[paper(),{code:403,data:{list:[]}}],[qq(),{ret:-1,comments:{new:[]}}],[sina(),{result:{status:{code:403},hot_list:[],cmntlist:[]}}],[netease(),{commentIds:[]}],[qq(),{ret:0,comments:{}}]] as const)assert.throws(()=>normalizeNewsComments(t,value,at));
 const other={...paper(),sourceId:'weibo' as const};assert.equal(normalizeNewsComments(other,null,at),undefined);assert.equal(await resolveNewsRequest(other,async()=>''),undefined);
});

test('QQ parent-child chains contribute only an explicitly identified chain root',()=>{
 const value={ret:0,comments:{new:[
  [{reply_id:'1',parentid:'1',reply_content:'这条是原评论',agree_count:9},{reply_id:'2',parentid:'1',reply_content:'这条是楼中楼',agree_count:99}],
  [{reply_id:'3',reply_content:'无法确定是根还是回复'},{reply_id:'4',reply_content:'同样无法确定层级'}],
  [{reply_id:'5',reply_content:'单元素根评论'}],
  [{reply_id:'6',parentid:'1',reply_content:'单元素也可能是楼中楼',agree_count:999}],
  [{reply_id:'7',parentid:null,reply_content:'层级数据损坏不能视作根'}]
 ]}};
 const out=normalizeNewsComments(qq(),value,at)!;assert.deepEqual(out.map(x=>x.id),['qq-news:1','qq-news:5']);assert.deepEqual(out.map(x=>x.text),['这条是原评论','单元素根评论']);
});
