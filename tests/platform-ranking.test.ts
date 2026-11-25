import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTopicRanking} from '../src/lib/ranking';
import {getSourceById,SOURCES} from '../src/lib/sources';
import {platformPolicy,scorePlatformItems} from '../src/lib/platform-ranking';
import type {RawHotItem} from '../src/lib/types';

function item(id:string,index:number,stats?:RawHotItem['stats']):RawHotItem {
 const source=getSourceById(id)!;
 return {sourceId:id,sourceName:source.displayName,sourceCategory:source.category,sourceKind:source.kind,
  title:`测试内容${index}`,rank:index+1,url:`https://example.test/${id}/${index}`,fetchedAt:'2026-11-24T00:00:00Z',stats};
}
const score=(items:RawHotItem[])=>new Map(scorePlatformItems(items).map(value=>[value.url,value]));

test('every registered platform has an explicit tier and every single-platform topic stays below its ceiling',()=>{
 for(const source of SOURCES){
  const policy=platformPolicy(source.id);assert.ok(policy,source.id);
  const rows=Array.from({length:10},(_,i)=>({...item(source.id,i,{likes:10**(i+1),comments:10**(i+1),danmaku:10**(i+1)}),title:'相同标题',heatValue:Number.MAX_VALUE}));
  const topic=buildTopicRanking(rows)[0];assert.ok(topic.heatScore<=policy.cap,`${source.id}: ${topic.heatScore}>${policy.cap}`);
 }
});

test('engagement percentiles can reorder items within one platform without rewarding absolute platform counts',()=>{
 const rows=Array.from({length:10},(_,i)=>item('bilibili',i,{likes:i*100,comments:i*10}));
 const small=score(rows),large=score(rows.map(value=>({...value,stats:{likes:value.stats!.likes!*100000,comments:value.stats!.comments!*100000}})));
 assert.ok(small.get(rows[9].url)!.platformScore>small.get(rows[0].url)!.platformScore);
 for(const row of rows)assert.equal(small.get(row.url)!.platformScore,large.get(row.url)!.platformScore);
});

test('another platform cannot change within-platform scores or supply its metric comparison pool',()=>{
 const rows=Array.from({length:8},(_,i)=>item('bilibili',i,{likes:i*100}));
 const alone=score(rows),mixed=score([...rows,...rows.map((_,i)=>item('douyin',i,{likes:1e12+i}))]);
 for(const row of rows)assert.equal(alone.get(row.url)!.platformScore,mixed.get(row.url)!.platformScore);
});

test('missing, sparse, constant and singleton statistics fall back to rank instead of fabricated zero engagement',()=>{
 const singleton=item('bilibili',0,{likes:100000});
 assert.equal(scorePlatformItems([singleton])[0].platformScore,400);
 const constant=Array.from({length:8},(_,i)=>item('bilibili',i,{likes:100}));
 const rankOnly=score(constant.map(value=>({...value,stats:undefined}))),tied=score(constant);
 for(const row of constant)assert.equal(tied.get(row.url)!.platformScore,rankOnly.get(row.url)!.platformScore);
 const sparse=constant.map((value,i)=>({...value,stats:i<3?{likes:i*100}:undefined}));
 for(const row of scorePlatformItems(sparse))assert.equal(row.platformScore,rankOnly.get(row.url)!.platformScore);
 const partial=constant.map((value,i)=>({...value,stats:i<7?{likes:i*100}:undefined}));
 assert.equal(score(partial).get(partial[7].url)!.platformScoring?.engagementStrength,undefined);
 assert.equal(score(partial).get(partial[7].url)!.platformScore,rankOnly.get(partial[7].url)!.platformScore);
});

test('provider aliases do not multiply percentile observations or let incomplete copies escape the score',()=>{
 const rows=Array.from({length:10},(_,i)=>item('bilibili',i,{likes:i*10,comments:i*2}));
 const base=score(rows),copies=score([...rows,...rows.map(value=>({...value,provider:'backup',url:value.url+'?provider=backup',stats:undefined}))]);
 for(const row of rows){
  assert.equal(copies.get(row.url)!.platformScore,base.get(row.url)!.platformScore);
  assert.equal(copies.get(row.url+'?provider=backup')!.platformScore,base.get(row.url)!.platformScore);
 }
});

test('Bilibili views/plays, comments/replies and approval aliases do not create extra metric weight',()=>{
 const rows=Array.from({length:8},(_,i)=>item('bilibili',i,{views:i*100,comments:i*2,likes:i*10}));
 const original=score(rows),aliases=score(rows.map(value=>({...value,stats:{...value.stats,plays:value.stats!.views,replies:value.stats!.comments,upvotes:value.stats!.likes}})));
 for(const row of rows)assert.equal(original.get(row.url)!.platformScore,aliases.get(row.url)!.platformScore);
});

test('cross-platform topic score equals bounded independent platform contributions, with no category or duplicate escape',()=>{
 const rows=[item('weibo',0),item('bilibili',0),{...item('bilibili',0),url:'https://example.test/duplicate'}];
 const topic=buildTopicRanking(rows)[0];assert.equal(topic.heatScore,900);
 assert.equal(topic.occurrences.find(value=>value.sourceId==='bilibili')!.platformScoring?.cap,400);
});

test('invalid source/rank evidence is excluded while legacy Weibo zero is treated as first place',()=>{
 const rows=[{...item('weibo',0),rank:0},{...item('douyin',0),rank:0},{...item('baidu',0),rank:-1},{...item('bilibili',0),rank:NaN},{...item('weibo',1),sourceId:'unregistered'}];
 const scored=scorePlatformItems(rows);assert.equal(scored.length,1);assert.equal(scored[0].platformScore,500);
});

test('object prototype names cannot become registered scoring platforms',()=>{
 for(const sourceId of ['constructor','toString','__proto__']){
  assert.equal(platformPolicy(sourceId),undefined);
  assert.deepEqual(scorePlatformItems([{...item('weibo',0),sourceId}]),[]);
 }
});
