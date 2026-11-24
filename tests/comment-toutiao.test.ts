import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveToutiaoThread,resolveToutiaoRequest,normalizeToutiaoComments} from '../src/lib/comments/toutiao';
const at='2026-11-24T09:54:00Z';
const topicId='7706674884917653001',postId='1882699991898124';
const thread=(path:string)=>resolveToutiaoThread({sourceId:'toutiao',url:'https://www.toutiao.com'+path})!;
const topic=()=>thread('/trending/'+topicId+'/');
const post=()=>thread('/w/'+postId+'/');
// Bounded official feed's first item, stripped to the original post URL and availability flag.
const firstItem={code:'',content:JSON.stringify({share_url:'https://m.toutiao.com/w/1882699991898124/?app=&use_new_style=1',ban_comment:0})};
// Official tab_comments response stripped of names, avatars, locations, user IDs, and reply trees.
const comments={message:'success',err_no:0,data:[{comment:{id_str:'7711546741077852964',text:'[呲牙]',digg_count:0}},{comment:{id_str:'7711648088742019859',text:'@豆包 925这事是真的吗',digg_count:0}}]};

test('Toutiao accepts only its content URLs and preserves distinction between a trend and an original post',()=>{
 assert.equal(topic().threadId,topicId);assert.equal(post().threadId,postId);assert.notEqual(topic().key,post().key);
 assert.equal(resolveToutiaoThread({sourceId:'toutiao',url:'https://m.toutiao.com/w/'+postId+'/?app=share'})?.key,post().key);
 assert.ok(thread('/article/7711546741077852964/'));
 for(const [sourceId,url] of [['weibo','https://www.toutiao.com/w/'+postId+'/'],['toutiao','http://www.toutiao.com/w/'+postId+'/'],['toutiao','https://u:p@www.toutiao.com/w/'+postId+'/'],['toutiao','https://www.toutiao.com:444/w/'+postId+'/'],['toutiao','https://www.toutiao.com.evil.test/w/'+postId+'/'],['toutiao','https://www.toutiao.com/search/123/'],['toutiao','https://www.toutiao.com/w/0/'],['toutiao','https://www.toutiao.com/trending/'+topicId+'/extra']])assert.equal(resolveToutiaoThread({sourceId,url}),undefined,url);
});
test('trending resolution reads only the first feed item and requests comments for its actual original post',async()=>{
 const request=await resolveToutiaoRequest(topic(),async(url,firstFeedItem)=>{
  const u=new URL(url);assert.equal(u.origin+u.pathname,'https://api.toutiaoapi.com/api/feed/topic_innerflow/v1/');assert.equal(u.searchParams.get('query_id'),topicId);assert.equal(u.searchParams.get('offset'),'-1');assert.equal(u.searchParams.get('count'),'1');assert.equal(u.searchParams.get('aid'),'13');assert.equal(u.searchParams.get('category'),'topic_innerflow');assert.equal(u.searchParams.get('stream_api_version'),'88');assert.equal(u.searchParams.get('ttfrom'),'amos_land_normal');assert.deepEqual(JSON.parse(u.searchParams.get('client_extra_params')!),{is_webview:'1',format:'jpeg'});assert.equal(firstFeedItem,true);
  return JSON.stringify({data:[firstItem]});
 });
 assert.equal(request?.articleUrl,'https://m.toutiao.com/w/1882699991898124/');const u=new URL(request!.url);assert.equal(u.origin+u.pathname,'https://www.toutiao.com/article/v2/tab_comments/');assert.equal(u.searchParams.get('group_id'),postId);assert.equal(u.searchParams.get('item_id'),postId);assert.equal(u.searchParams.get('count'),'20');assert.equal(u.searchParams.get('offset'),'0');assert.equal(u.searchParams.get('app_name'),'toutiao_web');assert.equal(u.searchParams.get('aid'),'24');
});
test('direct original post URLs request comments without an extra feed lookup',async()=>{
 const never=async()=>{throw new Error('direct posts do not need feed');};
 assert.equal((await resolveToutiaoRequest(post(),never))?.articleUrl,'https://m.toutiao.com/w/'+postId+'/');
 const a=await resolveToutiaoRequest(thread('/article/7711546741077852964/'),never);assert.equal(new URL(a!.url).searchParams.get('group_id'),'7711546741077852964');assert.equal(a?.articleUrl,'https://m.toutiao.com/article/7711546741077852964/');
});
test('an unavailable or nonpost first item never uses the topic ID, scans later feed items, or trusts foreign URLs',async()=>{
 for(const content of [{share_url:'https://evil.test/w/'+postId+'/'},{share_url:'https://www.toutiao.com/trending/'+topicId+'/'},{share_url:'https://m.toutiao.com/w/'+postId+'/',ban_comment:1},{}]){
  const result=await resolveToutiaoRequest(topic(),async()=>JSON.stringify({data:[{content:JSON.stringify(content)},firstItem]}));assert.equal(result,undefined);
 }
 assert.equal(await resolveToutiaoRequest(topic(),async()=>JSON.stringify({data:[]})),undefined);
 await assert.rejects(resolveToutiaoRequest(topic(),async()=>JSON.stringify({data:[{content:'not JSON'}]})));
 const other={...topic(),sourceId:'weibo' as const};assert.equal(await resolveToutiaoRequest(other,async()=>''),undefined);
});
test('real Toutiao comments preserve original text and zero likes while ignoring pinned and nested replies',()=>{
 const value=structuredClone(comments) as typeof comments & {stick_comments?:unknown[]};value.stick_comments=[{comment:{id_str:'999',text:'不能采集置顶',digg_count:99}}];Object.assign(value.data[0].comment,{reply_list:[{id_str:'998',text:'不能采集嵌套回复'}]});
 const out=normalizeToutiaoComments(post(),value,at)!;assert.deepEqual(out.map(x=>x.id),['toutiao:7711546741077852964','toutiao:7711648088742019859']);assert.deepEqual(out.map(x=>x.text),['[呲牙]','@豆包 925这事是真的吗']);assert.deepEqual(out.map(x=>x.likes),[0,0]);assert.equal(out[0].articleUrl,'https://m.toutiao.com/w/'+postId+'/');assert.equal(out[0].observedAt,at);
});
test('Toutiao normalization caps firstscreen input, deduplicates, validates votes, and preserves comparisons',()=>{
 const data=Array.from({length:25},(_,i)=>({comment:{id_str:String(i+1),text:i===0?'  A < B\n保留原话  ':'实际评论 '+i,digg_count:i}}));const out=normalizeToutiaoComments(post(),{message:'success',data},at)!;assert.equal(out.length,20);assert.equal(out[0].text,'A < B\n保留原话');
 const rows=[{id_str:'1',text:'原始评论',digg_count:'12'},{id_str:'1',text:'重复评论',digg_count:13},{id_str:'2',text:'字',digg_count:3},{id_str:'3',text:'长'.repeat(601),digg_count:1},{id_str:'4',text:'缺失点赞'},{id_str:'5',text:'错误点赞',digg_count:'-1'},{id_str:'6',text:'溢出点赞',digg_count:'9007199254740992'},{id_str:'not-id',text:'非法编号',digg_count:5}];
 const v=normalizeToutiaoComments(post(),{message:'success',data:rows.map(comment=>({comment}))},at)!;assert.deepEqual(v.map(x=>x.id),['toutiao:1','toutiao:4','toutiao:5','toutiao:6']);assert.deepEqual(v.map(x=>x.likes),[12,undefined,undefined,undefined]);
});
test('Toutiao distinguishes a valid empty comment list from refusals and malformed response schemas',()=>{
 assert.deepEqual(normalizeToutiaoComments(post(),{message:'success',data:[]},at),[]);
 for(const value of [{message:'error',data:[]},{message:'success',err_no:403,data:[]},{message:'success'},{data:[]}])assert.throws(()=>normalizeToutiaoComments(post(),value,at));
 assert.equal(normalizeToutiaoComments({...post(),sourceId:'weibo'},null,at),undefined);
});
