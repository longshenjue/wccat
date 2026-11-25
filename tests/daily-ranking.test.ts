import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTopicRanking} from '../src/lib/ranking';
import {buildDailyTopTopics} from '../src/lib/daily-report';
import {getSourceById} from '../src/lib/sources';
import {snapshot} from './helpers/data-fixtures';
import type {RawHotItem,TopicGroup} from '../src/lib/types';

function item(sourceId:string,title:string,rank=1):RawHotItem {
 const source=getSourceById(sourceId)!;
 return {sourceId,sourceName:source.displayName,sourceKind:source.kind,sourceCategory:source.category,rank,title,url:`https://example.test/${sourceId}/${encodeURIComponent(title)}`,heatValue:10000000,fetchedAt:'2026-11-24T00:00:00Z'};
}
function topic(title:string,ids:string[],rank=1):TopicGroup {
 const base=snapshot('2026-11-24-04').topics[0];
 return {...base,id:title,title,normalizedTitle:title,rank,heatScore:200,sources:ids.map(id=>getSourceById(id)!.displayName),occurrences:ids.map(id=>({...item(id,title),normalizedTitle:title,platformScore:200}))};
}
const analyze=()=>({});

test('editorial tier priorities place Zhihu above Bilibili and Douyin at the same platform rank',()=>{
 const video={...item('bilibili','一部创作者视频'),stats:{views:10000000,plays:10000000,likes:500000,favorites:100000,shares:50000,comments:100000,replies:100000,danmaku:100000}};
 const ranked=buildTopicRanking([video,item('douyin','社会生活热点'),item('zhihu','公共政策辩论')]);
 assert.deepEqual(ranked.map(t=>t.occurrences[0].sourceId),['zhihu','bilibili','douyin']);
 assert.deepEqual(ranked.map(t=>t.heatScore),[500,400,300]);
});
test('Bilibili comments and replies aliases contribute only once',()=>{
 const one={...item('bilibili','测试视频'),stats:{comments:100}};
 const aliased={...one,stats:{comments:100,replies:100}};
 assert.equal(buildTopicRanking([one])[0].heatScore,buildTopicRanking([aliased])[0].heatScore);
});
test('daily selection scans beyond hourly Top30 while standalone Bilibili contributions remain bounded',()=>{
 const samples=Array.from({length:6},(_,i)=>{
  const sample=snapshot(`2026-11-24-${String(i*4).padStart(2,'0')}`);
  sample.topics=[...Array.from({length:35},(_,j)=>topic(`独立视频${j}`,['bilibili'],j+1)),topic('跨平台公共议题',[i%2?'douyin':'weibo'],60)];
  sample.topics.at(-1)!.occurrences[0].rank=3;
  return sample;
 });
 const daily=buildDailyTopTopics(samples,analyze);
 assert.equal(daily[0].title,'跨平台公共议题');
 assert.deepEqual(daily[0].sources.sort(),['微博热搜','抖音热点']);
 assert.ok(daily.filter(t=>t.sources.every(source=>source==='B 站热门')).every(t=>t.dailyScore<=400));
});
test('cross-platform corroboration outranks repeated single-platform observations without counting provider aliases twice',()=>{
 const samples=Array.from({length:6},(_,i)=>{
  const sample=snapshot(`2026-11-24-${String(i*4).padStart(2,'0')}`);
  const solo=topic('单平台长驻话题',['douyin']);solo.occurrences.push({...solo.occurrences[0],provider:'tianapi',sourceName:'抖音热点备用接口'});solo.sources.push('抖音热点备用接口');
  sample.topics=[solo,...(i===5?[topic('多平台新进展',['weibo','baidu','douyin'],80)]:[])];
  return sample;
 });
 const daily=buildDailyTopTopics(samples,analyze);
 assert.equal(daily[0].title,'多平台新进展');
 assert.equal(daily.find(t=>t.title==='单平台长驻话题')!.rankingEvidence?.platforms.length,1);
});
test('manual samples inside the same four-hour slot do not increase the daily score',()=>{
 const base=Array.from({length:6},(_,i)=>{const s=snapshot(`2026-11-24-${String(i*4).padStart(2,'0')}`);s.topics=[topic('共同话题',['weibo','douyin'])];return s;});
 const extra=snapshot('2026-11-24-05');extra.topics=structuredClone(base[1].topics);
 const original=buildDailyTopTopics(base,analyze)[0],withExtra=buildDailyTopTopics([...base,extra],analyze)[0];
 assert.equal(withExtra.dailyScore,original.dailyScore);
 assert.equal(withExtra.sampleCount,7);assert.equal(original.sampleCount,6);
});
test('single-platform topics compete on bounded scores without artificial platform quotas',()=>{
 const sample=snapshot('2026-11-24-04');
 sample.topics=[...Array.from({length:4},(_,i)=>topic(`微博议题${i}`,['weibo'])),...Array.from({length:4},(_,i)=>topic(`抖音议题${i}`,['douyin'])),topic('小组帖子',['douban'])];
 const daily=buildDailyTopTopics([sample],analyze);
 assert.equal(daily.length,9);
 assert.equal(daily.filter(t=>t.sources.includes('微博热搜')).length,4);
 assert.equal(daily.filter(t=>t.sources.includes('抖音热点')).length,4);
 assert.equal(daily.at(-1)!.sources[0],getSourceById('douban')!.displayName);
});

test('Bilibili can contribute to a corroborated story and each platform has only one source link',()=>{
 const sample=snapshot('2026-11-24-04'),shared=topic('跨平台创作者文化',['bilibili','douyin']);
 shared.occurrences.push({...shared.occurrences[0],url:'https://example.test/bilibili/another-video',rank:2});
 sample.topics=[shared];const daily=buildDailyTopTopics([sample],analyze);
 assert.equal(daily.length,1);assert.equal(daily[0].rankingEvidence?.basis,'cross-platform');
 assert.deepEqual(daily[0].rankingEvidence?.platforms,['bilibili','douyin']);assert.equal(daily[0].links.length,2);
 assert.equal(daily[0].links.filter(link=>link.sourceId==='bilibili').length,1);
});

test('titles without a usable normalized identity cannot merge unrelated platforms into a daily topic',()=>{
 const sample=snapshot('2026-11-24-04');sample.topics=[topic('🔥',['weibo']),topic('🎉',['douyin'])];
 assert.deepEqual(buildDailyTopTopics([sample],analyze),[]);
});

test('legacy Weibo rank zero remains valid evidence while invalid-rank links cannot be selected',()=>{
 const sample=snapshot('2026-11-24-08'),shared=topic('历史跨平台话题',['weibo','baidu']);
 shared.occurrences[0].rank=0;shared.occurrences[1].rank=12;
 shared.occurrences.push({...shared.occurrences[0],rank:-1,url:'https://example.test/invalid-rank'}, {...shared.occurrences[1],rank:0,url:'https://example.test/unranked'});
 sample.topics=[shared];const daily=buildDailyTopTopics([sample],analyze);
 assert.equal(daily.length,1);assert.equal(daily[0].rankingEvidence?.basis,'cross-platform');
 assert.deepEqual(daily[0].rankingEvidence?.platforms,['baidu','weibo']);
 assert.equal(daily[0].rankingEvidence?.coveredSlots,1);assert.equal(daily[0].links.length,2);
 assert.ok(daily[0].links.every(link=>!link.url.includes('invalid-rank')&&!link.url.includes('unranked')));
});


test('daily persistence and repeated same-platform posts stay inside the platform hard ceiling',()=>{
 const samples=Array.from({length:6},(_,i)=>{
  const sample=snapshot(`2026-11-24-${String(i*4).padStart(2,'0')}`),video=topic('站内爆款',['bilibili']);
  video.heatScore=1e9;video.occurrences[0].platformScore=1e9;
  video.occurrences.push({...video.occurrences[0],provider:'backup',url:'https://example.test/backup'});
  sample.topics=[video];sample.rawItems=video.occurrences;return sample;
 });
 const daily=buildDailyTopTopics(samples,analyze)[0];assert.equal(daily.dailyScore,400);
 assert.equal(daily.rankingEvidence?.policy,'platform-tier-v3');
 assert.equal(daily.rankingEvidence?.platforms.length,1);
 const changed=structuredClone(samples);changed.forEach(s=>s.topics.forEach(t=>{t.heatScore=1;t.rank=999;t.occurrences.forEach(o=>{o.platformScore=1;});}));
 assert.equal(buildDailyTopTopics(changed,analyze)[0].dailyScore,daily.dailyScore);
});

test('daily generation uses genuine within-platform engagement ordering from the whole saved pool',()=>{
 const make=(reverse:boolean)=>{
  const sample=snapshot('2026-11-24-04');sample.topics=Array.from({length:10},(_,i)=>{
   const value=topic(`站内视频${i}`,['bilibili']);value.occurrences[0].rank=i+1;
   value.occurrences[0].stats={likes:(reverse?i:9-i)*100,comments:(reverse?i:9-i)*10};return value;
  });sample.rawItems=sample.topics.flatMap(t=>t.occurrences);return sample;
 };
 const descending=buildDailyTopTopics([make(false)],analyze),ascending=buildDailyTopTopics([make(true)],analyze);
 assert.equal(descending[0].title,'站内视频0');assert.equal(ascending[0].title,'站内视频9');
 assert.ok(ascending.every(t=>t.dailyScore<=400));
});

test('source collection outages are unavailable observations rather than invented zero engagement',()=>{
 const first=snapshot('2026-11-24-04');first.topics=[topic('站内爆款',['bilibili'])];first.rawItems=first.topics[0].occurrences;
 const gaps=Array.from({length:5},(_,i)=>{const sample=snapshot(`2026-11-24-${String(8+i*3).padStart(2,'0')}`);sample.topics=[];sample.rawItems=[];return sample;});
 const before=buildDailyTopTopics([first],analyze)[0],after=buildDailyTopTopics([first,...gaps],analyze)[0];
 assert.equal(before.dailyScore,after.dailyScore);
});

test('daily Zhihu and Douyin contributions honor the editorial overrides across repeated captures',()=>{
 const samples=Array.from({length:6},(_,i)=>{
  const sample=snapshot(`2026-11-24-${String(i*4).padStart(2,'0')}`);
  sample.topics=[topic('知乎公共政策讨论',['zhihu']),topic('抖音热门创意视频',['douyin'])];
  sample.rawItems=sample.topics.flatMap(t=>t.occurrences);return sample;
 });
 const daily=buildDailyTopTopics(samples,analyze);
 assert.deepEqual(daily.map(t=>t.sources[0]),['知乎热榜','抖音热点']);
 assert.deepEqual(daily.map(t=>t.dailyScore),[500,300]);
});
