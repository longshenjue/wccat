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
