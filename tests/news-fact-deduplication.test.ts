import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTopicRanking} from '../src/lib/ranking';
import {buildDailyTopTopics} from '../src/lib/daily-report';
import {getSourceById} from '../src/lib/sources';
import {normalizeTitle} from '../src/lib/normalize';
import {groupNewsFacts,sameNewsFact} from '../src/lib/news-facts';
import {buildFallbackTopicAnalysis} from '../src/lib/topic-analysis';
import {inferSentiment} from '../src/lib/sentiment';
import {snapshot} from './helpers/data-fixtures';
import type {RawHotItem,TopicGroup} from '../src/lib/types';

function item(title:string,sourceId='weibo',rank=1):RawHotItem {
 const source=getSourceById(sourceId)!;
 return {title,sourceId,sourceName:source.displayName,sourceCategory:source.category,sourceKind:source.kind,
  rank,url:`https://example.test/${sourceId}/${encodeURIComponent(title)}`,fetchedAt:'2026-11-25T00:00:00Z'};
}
function topic(title:string,sourceId='weibo',rank=1):TopicGroup {
 const base=snapshot('2026-11-25-04').topics[0];
 return {...base,id:title,title,normalizedTitle:normalizeTitle(title),heatScore:500,rank,
  occurrences:[{...item(title,sourceId,rank),normalizedTitle:normalizeTitle(title),platformScore:500}]};
}
function daily(titles:string[]) {
 const sample=snapshot('2026-11-25-04');sample.topics=titles.map(title=>topic(title));sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 return buildDailyTopTopics([sample],()=>({}));
}

// Headline strings are regression inputs, not independently verified news claims.
const responseVariants=['上海就陈吉宁被查表态','陈吉宁被查 上海表态','陈吉宁被查 上海市政府党组等表态'];
const launchVariants=['神舟二十四号发射成功','神舟24发射圆满成功','神舟二十四号载人飞船发射取得圆满成功'];

test('daily combines the screenshot response and launch variants before selecting ten entries',()=>{
 const other=['天津发布教育政策','中外航天员实现首次太空握手','特朗普对一道中国菜念念不忘','巴基斯坦航天界全程观看直播',
  '巴基斯坦航天员手指国旗向镜头敬礼','手机新品发布','安徽成立联合调查组','本地消费价格报告'];
 const result=daily([...responseVariants,...launchVariants,...other]);
 assert.equal(result.length,10);
 assert.equal(result.filter(t=>t.title.includes('陈吉宁')).length,1);
 assert.equal(result.filter(t=>/发射/.test(t.title)).length,1);
 assert.ok(result.some(t=>t.title==='本地消费价格报告'),'refill from the full candidate pool');
 assert.equal(result.filter(t=>/航天员|航天界/.test(t.title)).length,3,'distinct actions remain visible');
});

test('hourly grouping uses the same fact identity for reordered and numeral variants',()=>{
 for(const variants of [responseVariants,launchVariants]){
  const result=buildTopicRanking(variants.map((title,i)=>item(title,['weibo','baidu','douyin'][i])));
  assert.equal(result.length,1,variants.join(' / '));
  assert.equal(result[0].occurrences.length,3);
 }
});

test('saved source abbreviations and municipal collective-response wording join the same development',()=>{
 assert.equal(daily([...launchVariants,'神24发射圆满成功']).length,1);
 assert.equal(daily([...responseVariants,'上海市委就陈吉宁被查表态','陈吉宁被查 上海市人大常委会党组等表态']).length,1);
});

test('generic response headlines cannot bridge two explicitly different singular authorities',()=>{
 const variants=['上海市委就某事件表态','上海就某事件表态','上海市政府就某事件表态'];
 for(const titles of [variants,[...variants].reverse(),[variants[1],variants[0],variants[2]]]){
  const groups=groupNewsFacts(titles,title=>title);
  assert.equal(groups.length,2);
  assert.ok(groups.every(group=>!(group.includes(variants[0])&&group.includes(variants[2]))));
 }
});

test('reordering complete clauses is safe, while an ambiguous response split cannot transitively join facts',()=>{
 assert.equal(daily(['甲公司发布新品，乙公司宣布降价','乙公司宣布降价，甲公司发布新品']).length,1);
 const titles=['丙丁戊己回应甲乙','甲乙丙丁戊己回应','戊己回应甲乙丙丁'];
 assert.equal(sameNewsFact(titles[0],titles[1]),true);
 assert.equal(sameNewsFact(titles[1],titles[2]),true);
 assert.equal(sameNewsFact(titles[0],titles[2]),false);
 assert.equal(groupNewsFacts(titles,title=>title).length,2);
});

test('same person or mission does not merge stages, dates, numbers, negation, questions or reversed roles',()=>{
 const pairs=[
  ['陈某被查','上海就陈某被查表态'],['陈某被查','陈某被免职'],['陈某被查','陈某未被查'],
  ['上海就陈某被查表态','上海再次就陈某被查表态'],['上海回应陈某被查','上海否认陈某被查'],
  ['上海回应陈某被查','上海回应陈某未被查'],['上海回应陈某被查','上海回应陈某被查了吗'],
  ['神舟二十四号发射成功','神舟二十四号完成对接'],['神舟二十四号发射成功','神舟二十五号发射成功'],
  ['神舟24将于26日发射','神舟24将于27日发射'],['事故造成3人受伤','事故造成5人受伤'],
  ['甲公司收购乙公司','乙公司收购甲公司'],['甲公司回应乙公司','乙公司回应甲公司'],
  ['警方回应学生失踪','警方通报学生失踪'],['新品发布','新产品发布'],
  ['A defeats B','B defeats A'],['甲公司向乙公司赔偿','乙公司向甲公司赔偿']
 ];
 for(const pair of pairs){
  assert.equal(daily(pair).length,2,pair.join(' / '));
  assert.equal(buildTopicRanking(pair.map(title=>item(title))).length,2,pair.join(' / '));
 }
});

test('daily recomputes merged evidence once per platform/block and counts each snapshot once',()=>{
 const a=snapshot('2026-11-25-04'),b=snapshot('2026-11-25-08');
 a.topics=[topic(responseVariants[0]),topic(responseVariants[1]),topic(responseVariants[2],'baidu')];
 b.topics=[topic(responseVariants[1]),topic(responseVariants[2],'baidu')];
 for(const sample of [a,b])sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 const before=JSON.stringify([a,b]),result=buildDailyTopTopics([a,b],()=>({}));
 assert.equal(result.length,1);const merged=result[0];
 assert.equal(merged.dailyScore,1000);assert.equal(merged.sampleCount,2);assert.equal(merged.sampleCoverage,1);
 assert.deepEqual(merged.rankingEvidence?.platforms,['baidu','weibo']);assert.equal(merged.links.length,2);
 assert.ok(merged.analysisTopicId&&merged.analysisSnapshotDate);
 assert.equal(JSON.stringify([a,b]),before,'do not mutate archived evidence');
});

test('daily separates archived groups whose lossy normalized titles or occurrence bundles mixed developments',()=>{
 const sample=snapshot('2026-11-25-04'),mixed=topic('警方回应学生失踪');
 mixed.occurrences.push({...item('警方公布学生失踪调查结果','baidu'),normalizedTitle:'警方学生失踪',platformScore:500});
 sample.topics=[mixed,topic('警方学生失踪')];
 sample.topics.forEach(t=>{t.normalizedTitle='警方学生失踪';});
 sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 const analysis={...snapshot('2026-11-25-04').topics[0],model:'saved-mixed'};
 const result=buildDailyTopTopics([sample],()=>({[mixed.id]:analysis as never}));
 assert.equal(result.length,3);
 for(const entry of result.filter(t=>t.title!=='警方学生失踪')){
  assert.equal(entry.aiAnalysis,undefined,'mixed analysis cannot support a narrower fact');
  assert.equal(entry.analysisTopicId,undefined);
 }
});

test('split archived groups use the actual occurrence headline instead of reusing one generic lead twice',()=>{
 const sample=snapshot('2026-11-25-04'),mixed=topic('上海就某事件表态');
 const titles=['上海市委就某事件表态','上海市政府就某事件表态'];
 mixed.occurrences=titles.map((title,i)=>({...item(title,i?'baidu':'weibo'),normalizedTitle:normalizeTitle(title),platformScore:500}));
 sample.topics=[mixed];sample.rawItems=mixed.occurrences;
 const result=buildDailyTopTopics([sample],()=>({}));
 assert.deepEqual(new Set(result.map(t=>t.title)),new Set(titles));
 assert.equal(new Set(result.map(t=>t.id)).size,2);
});

test('long source headlines keep bounded daily identities usable by single-topic sharing',()=>{
 const [entry]=daily(['一个完整标题'+ '详细背景'.repeat(70)]);
 assert.ok(entry.id.length<=200);
 assert.ok(!/[/?#\s]/u.test(entry.id));
});

test('global bridge splits cannot carry another authority’s saved summary or analysis into the final group',()=>{
 const sample=snapshot('2026-11-25-04');
 const government=topic('上海市政府就某事件表态'),committee=topic('上海市委就某事件表态','douyin');
 government.heatScore=100;committee.heatScore=200;
 government.occurrences.push({...item('上海就某事件表态','baidu'),normalizedTitle:'概括',platformScore:500});
 committee.occurrences.push({...item('上海就某事件表态','toutiao'),normalizedTitle:'概括',platformScore:500});
 committee.summary.oneLine='这是市委的专属说明';
 sample.topics=[government,committee];sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 const analyses={
  [government.id]:{...buildFallbackTopicAnalysis(government),model:'saved-government'},
  [committee.id]:{...buildFallbackTopicAnalysis(committee),model:'saved-committee'}
 };
 const result=buildDailyTopTopics([sample],()=>analyses);
 const entry=result.find(t=>t.links.some(link=>link.title===government.title))!;
 assert.equal(entry.analysisTopicId,government.id);
 assert.equal(entry.aiAnalysis?.model,'saved-government');
 assert.notEqual(entry.oneLine,committee.summary.oneLine);
 const other=result.find(t=>t.links.some(link=>link.title===committee.title))!;
 assert.equal(other.analysisTopicId,committee.id);
});

test('explicit clause boundaries preserve the responder rather than moving the target into the actor',()=>{
 for(const titles of [
  ['日本抗议韩国，外交部回应','日本抗议，韩国外交部回应'],
  ['乌克兰指责俄罗斯，外交部回应','乌克兰指责，俄罗斯外交部回应'],
  ['日本抗议韩国 外交部回应','日本抗议 韩国外交部回应']
 ])assert.equal(daily(titles).length,2,titles.join(' / '));
 // Two unmarked, ambiguous actor splits cannot confirm each other's meaning.
 assert.equal(sameNewsFact('某事件上海表态','某事件上海市委表态'),false);
});

test('mission number boundaries cannot absorb an adjacent day or count',()=>{
 for(const titles of [
  ['神舟二号24日发射','神舟二十二号4日发射'],
  ['神舟2号24日发射','神舟22号4日发射'],
  ['神舟2号 24日发射','神舟22号 4日发射']
 ])assert.equal(daily(titles).length,2,titles.join(' / '));
});

test('split developments get their own hourly peaks and sentiment instead of inheriting a mixed parent’s',()=>{
 const samples=['04','08'].map(hour=>{
  const sample=snapshot(`2026-11-25-${hour}`),mixed=topic('男子发生交通事故');
  mixed.heatScore=1000;mixed.rank=1;mixed.sentiment='entertainment';
  const later=topic('男子交通事故被证实为谣言','baidu',40).occurrences[0];
  mixed.occurrences.push(later);
  sample.topics=[mixed,...Array.from({length:5},(_,i)=>topic(`另外一条独立新闻${i}`,'weibo',i+2))];
  sample.rawItems=sample.topics.flatMap(t=>t.occurrences);return sample;
 });
 const result=buildDailyTopTopics(samples,()=>({}));
 const later=result.find(t=>t.title==='男子交通事故被证实为谣言')!;
 assert.equal(later.peakHeatScore,110);assert.equal(later.peakRank,7);
 assert.equal(later.signal,'long-tail');assert.equal(later.sentiment,inferSentiment(later.title));
 assert.equal(result.find(t=>t.title==='男子发生交通事故')!.peakHeatScore,500);
});

test('a valid saved analysis survives merging even when a hotter equivalent parent has no analysis',()=>{
 const sample=snapshot('2026-11-25-04'),hot=topic(responseVariants[0]),saved=topic(responseVariants[1],'baidu');
 hot.heatScore=1000;saved.heatScore=500;sample.topics=[hot,saved];sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 const analysis={...buildFallbackTopicAnalysis(saved),model:'saved-equivalent'};
 let reads=0;
 const [entry]=buildDailyTopTopics([sample],()=>{reads++;return {[saved.id]:analysis};});
 assert.equal(entry.analysisTopicId,saved.id);assert.equal(entry.aiAnalysis?.model,'saved-equivalent');
 assert.equal(reads,1,'read each snapshot analysis map only once');
});
