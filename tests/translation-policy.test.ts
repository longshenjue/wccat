import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShareTranslation,getDailyShareCopy,type NumericalWarning} from '../src/lib/daily-share-copy';
import {report} from './helpers/data-fixtures';
const copy=(headline:string)=>({headline,overview:'',topics:[]});

test('numeric differences are advisory by default and return usable English',()=>{
 const warnings:NumericalWarning[]=[];
 const source=copy('中国近六成家庭户不超过两个人');
 const english=copy('Nearly 70% of Chinese households have no more than two people');
 assert.deepEqual(validateShareTranslation(english,source,{onNumericalWarning:warning=>warnings.push(warning)}),english);
 assert.equal(warnings.length,1);assert.equal(warnings[0].path,'headline');assert.equal(warnings[0].source,source.headline);
});
test('equivalent Chinese fractions and English percentages do not produce advisory noise',()=>{
 const warnings:NumericalWarning[]=[];
 const english=copy('Nearly 60% of Chinese households have no more than two people');
 assert.deepEqual(validateShareTranslation(english,copy('中国近六成家庭户不超过两个人'),{onNumericalWarning:w=>warnings.push(w)}),english);
 assert.deepEqual(warnings,[]);
});
test('advisory numeric mode keeps identity, missing fields and untranslated output blocking',()=>{
 const source={headline:'标题',overview:'总览',topics:[{id:'t1',title:'标题',oneLine:'摘要',whyItMatters:'背景',sources:['微博']}]};
 const valid={headline:'Title',overview:'Overview',topics:[{id:'t1',title:'Title 60',oneLine:'Summary',whyItMatters:'Context',sources:['Weibo']}]};
 assert.throws(()=>validateShareTranslation({...valid,topics:[{...valid.topics[0],id:'t2'}]},source),/identity/);
 assert.throws(()=>validateShareTranslation({...valid,overview:''},source),/Incomplete/);
 assert.throws(()=>validateShareTranslation({...valid,topics:[]},source),/Incomplete list/);
 assert.throws(()=>validateShareTranslation({...valid,headline:'未翻译'},source),/Incomplete English/);
});
test('legacy saved English stays downloadable despite a numeric discrepancy',()=>{
 const saved=report('2026-11-15');saved.topics[0].title='中国近六成家庭户不超过两个人';
 saved.shareEnglish!.topics[0].title='Nearly 70% of Chinese households have no more than two people';
 assert.deepEqual(getDailyShareCopy(saved,'en'),saved.shareEnglish);
});
test('a numerical parser limitation also remains advisory',()=>{
 const warnings:NumericalWarning[]=[];
 const english=copy('One out of zero');
 assert.deepEqual(validateShareTranslation(english,copy('零分之一'),{onNumericalWarning:w=>warnings.push(w)}),english);
 assert.equal(warnings.length,1);
});
