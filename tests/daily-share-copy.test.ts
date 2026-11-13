import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShareTranslation, type DailyShareCopy } from '../src/lib/daily-share-copy';

const original: DailyShareCopy = {
 headline:'日报', overview:'总览',
 topics:[{id:'topic-1',title:'标题',oneLine:'摘要',whyItMatters:'原因',sources:['微博']}],
 analysis: {
  summary:'摘要', detailedContent:'全文', outsiderContext:'背景', changeReason:'首次分析',
  battle:{redLabel:'质疑',blueLabel:'支持',redRationale:'红方依据',blueRationale:'蓝方依据'},
  platformAnalyses:[{sourceId:'weibo',sourceName:'微博',attitude:'观点',evidence:'依据'}]
 }
};
const translated: DailyShareCopy = {
 headline:'Daily',overview:'Overview',
 topics:[{id:'topic-1',title:'Title',oneLine:'Summary',whyItMatters:'Context',sources:['Weibo']}],
 analysis: {
  summary:'Summary',detailedContent:'Full analysis',outsiderContext:'Context',changeReason:'First analysis',
  battle:{redLabel:'Doubt',blueLabel:'Support',redRationale:'Red evidence',blueRationale:'Blue evidence'},
  platformAnalyses:[{sourceId:'weibo',sourceName:'Weibo',attitude:'Attitude',evidence:'Evidence'}]
 }
};

test('accepts a complete translation preserving topic and platform identity',()=>{
 assert.deepEqual(validateShareTranslation(translated,original),translated);
});
test('rejects truncated topic lists instead of silently omitting ranked topics',()=>{
 assert.throws(()=>validateShareTranslation({...translated,topics:[]},original));
});
test('rejects partial analysis and untranslated copy',()=>{
 assert.throws(()=>validateShareTranslation({...translated,analysis:{summary:'Only summary'}},original));
 assert.throws(()=>validateShareTranslation(original,original));
});
test('rejects reordered or changed identities and empty translations',()=>{
 const bad=structuredClone(translated);
 bad.topics[0].id='wrong';
 assert.throws(()=>validateShareTranslation(bad,original));
 const platform=structuredClone(translated);
 platform.analysis!.platformAnalyses[0].sourceId='wrong';
 assert.throws(()=>validateShareTranslation(platform,original));
 assert.throws(()=>validateShareTranslation({...translated,headline:'  '},original));
});

test('rejects changed numbers and accepts equivalent localized dates and magnitudes',()=>{
 const source={headline:'增长12%，2026年11月12日热度1100万，第2名，160周年',overview:'',topics:[]};
 const valid={headline:'Growth of 12%, November 12, 2026, heat 11 million, rank 2, 160th anniversary',overview:'',topics:[]};
 assert.deepEqual(validateShareTranslation(valid,source),valid);
 assert.throws(()=>validateShareTranslation({...valid,headline:valid.headline.replace('12%','90%')},source));
 assert.throws(()=>validateShareTranslation({...valid,headline:valid.headline.replace('11 million','11 billion')},source));
});

test('accepts equivalent Chinese seasons, month names without a year, and implicit magnitudes',()=>{
 const cases = [
  ['【纪录片】人生一串 第四季 02 心惊肉跳', '[Documentary] Life Is a String Season 4 Episode 02: Heart-Stopping'],
  ['11月12日18时54分回应', 'Responded at 18:54 on November 12'],
  ['话题排名第6，热度近千万', 'The topic ranks 6th, with nearly 10 million in heat'],
  ['第四季，2026年11月12日，热度两千万', 'Season 4, November 12, 2026, heat 20 million']
 ];
 for (const [title, englishTitle] of cases) {
  const source={...original,topics:[{...original.topics[0],title}]};
  const english={...translated,topics:[{...translated.topics[0],title:englishTitle}]};
  assert.deepEqual(validateShareTranslation(english,source),english);
 }
});

test('still rejects changed seasons, partial dates, and implicit Chinese magnitudes',()=>{
 const cases = [
  ['第四季 02', 'Season 5 Episode 02'],
  ['11月12日18时54分', '18:54 on November 13'],
  ['热度近千万', 'Heat nearly 10 billion']
 ];
 for (const [title, englishTitle] of cases) {
  assert.throws(()=>validateShareTranslation(
   {...translated,topics:[{...translated.topics[0],title:englishTitle}]},
   {...original,topics:[{...original.topics[0],title}]}
  ));
 }
});

test('reports the exact location of a rejected translated title',()=>{
 assert.throws(()=>validateShareTranslation(
  {...translated,topics:[{...translated.topics[0],title:'Season 5'}]},
  {...original,topics:[{...original.topics[0],title:'第四季'}]}
 ),/topics\[0\]\.title/);
});

test('does not interpret Chinese names and idioms as quantities',()=>{
 const source={headline:'人生一串：千万不要信谣',overview:'',topics:[]};
 const english={headline:'Life Is a String: never believe rumors',overview:'',topics:[]};
 assert.deepEqual(validateShareTranslation(english,source),english);
});

test('does not turn approximate Chinese compounds into exact numbers',()=>{
 const source={headline:'成千上万人参加活动',overview:'',topics:[]};
 const english={headline:'Thousands of people attended the event',overview:'',topics:[]};
 assert.deepEqual(validateShareTranslation(english,source),english);
});

test('rejects season/episode and date/time swaps even when the same digits remain',()=>{
 for(const [headline,englishHeadline] of [
  ['第四季 02','Season 2 Episode 04'],
  ['11月12日18时54分','18:54 on December 11'],
  ['11月12日18时54分','12:54 on November 18']
 ]){
  assert.throws(()=>validateShareTranslation(
   {headline:englishHeadline,overview:'',topics:[]},
   {headline,overview:'',topics:[]}
  ));
 }
});

test('accepts quantity thresholds, alternate day markers, and ratios',()=>{
 for(const [headline,englishHeadline] of [
  ['上千人参与','More than 1,000 people participated'],
  ['11月12号回应','Responded on November 12'],
  ['比分2:1','The score was 2 to 1'],
  ['日报2026-11-13','Daily report November 13, 2026']
 ]){
  const english={headline:englishHeadline,overview:'',topics:[]};
  assert.deepEqual(validateShareTranslation(english,{headline,overview:'',topics:[]}),english);
 }
});

test('recognizes the year attached to compact multi-day English date ranges',()=>{
 const source={...original,analysis:{...original.analysis!,detailedContent:'2027年报名人数为347万，考试定于2026年12月19日至20日举行，此前高峰400万，关注27考研。'}};
 for(const dates of ['December 19–20, 2026','December 19-20,2026','December 19 to 20 in 2026','19–20 December 2026','19th through 20th December,2026']){
  const english={...translated,analysis:{...translated.analysis!,detailedContent:`The 2027 exam attracted 3.47 million applicants, scheduled for ${dates}; the previous peak was 4 million, with attention on the 27 exam.`}};
  assert.deepEqual(validateShareTranslation(english,source),english);
 }
});

test('rejects moved or omitted range years despite an identical bag of numbers',()=>{
 const source={headline:'2027年考研，考试定于2026年12月19日至20日举行。',overview:'',topics:[]};
 for(const headline of ['The 2026 exam is on December 19–20, 2027.','In 2026 the 2027 exam is scheduled for December 19–20.']){
  assert.throws(()=>validateShareTranslation({headline,overview:'',topics:[]},source));
 }
});

test('accepts explicit single-date years with compact comma spacing',()=>{
 const source={headline:'日期2026年12月19日',overview:'',topics:[]};
 for(const headline of ['Date December 19,2026','Date 19 December,2026']){
  assert.deepEqual(validateShareTranslation({headline,overview:'',topics:[]},source),{headline,overview:'',topics:[]});
 }
});
