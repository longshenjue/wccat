import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';

test('editorial shortlist considers only the requested day and yesterday, deduplicates and never calls AI',async()=>{
 const ctx=await testDatabase(),previousFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('No network during recommendations');};
 try{
  const {editorialShortlist}=await import('../src/lib/topic-sharing/shortlist');
  const old=report('2026-11-22');old.topics[0].title='旧故事不应出现';ctx.saveDailyReportToDb(old);
  const daily=report('2026-11-23');daily.topics[0].title='手机定价与用户体验';daily.topics[0].categories=['business'];ctx.saveDailyReportToDb(daily);
  const hour=snapshot('2026-11-24-12');hour.topics[0].title='手机定价与用户体验';hour.topics.push({...hour.topics[0],id:'culture',title:'猫meme文化正在流行',rank:2,categories:['video'],occurrences:[{...hour.topics[0].occurrences[0],title:'猫meme文化正在流行'}]});ctx.saveSnapshotToDb(hour);
  const result=editorialShortlist('2026-11-24');
  assert.ok(result.english.length>0);assert.ok(result.chinese.length>0);assert.ok(result.english.length<=3);assert.equal(new Set(result.english.map(row=>row.title)).size,result.english.length);
  assert.ok(result.english.every(row=>['2026-11-23','2026-11-24'].includes(row.date)));assert.ok(result.english.every(row=>row.title!=='旧故事不应出现'));assert.equal(network,0);
  assert.equal(result.cadence.dailyImages,4);assert.equal(result.cadence.storiesMax,3);assert.deepEqual(editorialShortlist('2025-01-01').english,[]);
  const renamed={...hour,generatedAt:'2026-11-24T13:00:00Z',topics:hour.topics.map((topic,index)=>index===0?{...topic,title:'手机新品正式亮相'}:{...topic,occurrences:[{...topic.occurrences[0],url:'https://example.test/culture'}]})};
  ctx.saveSnapshotToDb(renamed);
  const merged=editorialShortlist('2026-11-24');
  assert.equal(merged.english.filter(row=>['手机定价与用户体验','手机新品正式亮相'].includes(row.title)).length,1,'the same stable topic/source cannot be recommended twice after a title changes');
 }finally{globalThis.fetch=previousFetch;ctx.close();}
});
