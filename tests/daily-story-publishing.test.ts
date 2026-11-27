import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {report,testDatabase} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {buildChineseDailyCards} from '../src/lib/daily-bilingual-cards';
import {shareEnEditorialSource,shareEnSupportedTopicIds} from '../src/lib/shareen-draft';
import {shareEnTextFiles} from '../src/lib/share-export';
import {dailyPublication} from '../src/lib/publications/projection';
import {DailyWorkbench} from '../src/components/daily-workbench';

function groupedReport(){
 const daily=report('2026-11-26'),stage=structuredClone(daily.topics[0]);
 stage.id='related-response';stage.title='当事人回应此前的病情报道';stage.aiAnalysis!.summary='回应称希望公众关注疾病研究。';stage.links=[{sourceId:'weibo',sourceName:'微博热搜',title:stage.title,url:'https://weibo.com/123/Response'}];
 daily.topics[0].relatedDevelopments=[stage];return daily;
}

test('bilingual daily evidence and source downloads preserve related stages without treating them as extra ranked stories',async()=>{
 const daily=groupedReport(),copy=await savedShareEnFixture(daily),source=shareEnEditorialSource(daily,daily.topics[0].id);
 assert.match(source.detail,/当事人回应此前的病情报道/);assert.ok(source.links.some(link=>link.url.endsWith('/Response')));
 const native=buildChineseDailyCards(daily,copy);assert.deepEqual(native.overview.topics.map(t=>t.id),copy.overview.topics.map(t=>t.id));
 assert.match(native.highlights[0].context,/当事人回应此前的病情报道/);
 for(const language of ['en','zh'] as const){const text=new TextDecoder().decode(shareEnTextFiles(daily,copy,language).find(f=>f.name==='sources.txt')!.data);assert.match(text,/当事人回应此前的病情报道/);assert.match(text,/weibo.com\/123\/Response/);}
 assert.match(renderToStaticMarkup(createElement(DailyWorkbench,{report:daily})),/同一主线的其他进展/);
});

test('single-topic sharing and immutable daily source pages retain grouped source wording and links',async()=>{
 const ctx=await testDatabase();
 try{
  const daily=groupedReport();daily.shareEn=await savedShareEnFixture(daily);ctx.saveDailyReportToDb(daily);
  const {loadTopicShareSource}=await import('../src/lib/topic-sharing/source');
  const source=loadTopicShareSource({kind:'daily',date:daily.reportDate,topicId:daily.topics[0].id});
  assert.match(source.detail,/当事人回应此前的病情报道/);assert.ok(source.links.some(link=>link.url.endsWith('/Response')));
  const payload=dailyPublication(daily);assert.equal(payload.cards.length,daily.topics.length);
  assert.equal(payload.cards[0].relatedDevelopments?.[0].title,'当事人回应此前的病情报道');
  assert.equal(payload.cards[0].relatedDevelopments?.[0].links[0].url,'https://weibo.com/123/Response');
  assert.doesNotMatch(JSON.stringify(payload.cards[0].relatedDevelopments),/model|redScore|blueScore|reviewWarnings|sourceKey/);
  // One leading fact plus four retained stages: every stage still needs provenance.
  const lead=daily.topics[0];lead.relatedDevelopments=Array.from({length:4},(_,i)=>({...structuredClone(lead.relatedDevelopments![0]),id:`stage-${i}`,title:`独立进展${i}`,links:Array.from({length:6},(_,j)=>({sourceId:'weibo',sourceName:'微博',title:`进展${i}`,url:`https://weibo.com/123/stage-${i}-${j}`}))}));
  lead.links=Array.from({length:6},(_,i)=>({sourceId:'weibo',sourceName:'微博',title:lead.title,url:`https://weibo.com/123/lead-${i}`}));
  ctx.saveDailyReportToDb(daily);
  const complete=loadTopicShareSource({kind:'daily',date:daily.reportDate,topicId:lead.id});
  assert.equal(complete.links.length,30);assert.ok(complete.links.some(link=>link.url.endsWith('stage-3-5')));
 }finally{ctx.close();}
});

test('an unanalysed leading fact can use labelled related-stage evidence without borrowing its attitudes',async()=>{
 const daily=groupedReport(),lead=daily.topics[0],stage=lead.relatedDevelopments![0];
 lead.oneLine=lead.title;lead.whyItMatters='';delete lead.aiAnalysis;
 stage.aiAnalysis!.detailedContent='当事人作出公开回应，说明此前报道的具体背景。';
 assert.deepEqual(shareEnSupportedTopicIds(daily),[lead.id]);
 const native=buildChineseDailyCards(daily,await savedShareEnFixture(daily));
 assert.match(native.highlights[0].whatHappened,/当事人回应此前的病情报道/);
 assert.match(native.highlights[0].whatHappened,/说明此前报道的具体背景/);
 assert.equal(native.highlights[0].battle,undefined,'related-stage scores do not become the lead attitudes');
 stage.oneLine=stage.title;stage.whyItMatters='';delete stage.aiAnalysis;
 assert.deepEqual(shareEnSupportedTopicIds(daily),[],'a related headline alone is not explanatory evidence');
});
