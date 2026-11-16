import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShareTranslation as validate} from '../src/lib/daily-share-copy';
const validateShareTranslation=(value:unknown,source:Parameters<typeof validate>[1])=>validate(value,source,{numerical:'strict'});

const copy=(headline:string)=>({headline,overview:'',topics:[]});
const validPairs=[
 ['中国近六成家庭户不超过两个人','Nearly 60% of Chinese households have no more than two people'],
 ['中国近六成家庭户不超过两个人','Nearly sixty percent of Chinese households have no more than 2 people'],
 ['六成家庭','6 out of 10 households'],
 ['六成五的家庭','65 percent of households'],
 ['百分之五的用户','Five percent of users'],
 ['千分之五的用户','0.5% of users'],
 ['三分之一的家庭','One-third of households'],
 ['半数家庭','Half of households'],
 ['二分之一的家庭','One-half of households'],
 ['二分之一的家庭','One half of households'],
 ['四分之三的家庭','Three quarters of households'],
 ['三人获奖','Three people won awards'],
 ['六十岁老人完成挑战','A sixty-year-old man completed the challenge'],
 ['旅行者1号飞了近50年，将抵达一光日','Voyager 1 has flown for nearly 50 years and will reach one light-day'],
 ['二〇二六年十一月十五日','November 15, 2026'],
 ['２０２６年１１月１５日','November 15, 2026'],
 ['一百二十三万元','1.23 million yuan'],
 ['一百二十三万元','One million two hundred and thirty thousand yuan'],
 ['人生一串：千万不要信谣','Life Is a String: never believe rumors'],
 ['三体与一带一路','The Three-Body Problem and the Belt and Road Initiative'],
] as const;

test('normalizes equivalent bilingual numerical expressions before validating facts',async(t)=>{
 for(const [zh,en] of validPairs)await t.test(zh+' → '+en,()=>assert.deepEqual(validateShareTranslation(copy(en),copy(zh)),copy(en)));
});

test('rejects actual ratio/count changes and preserves quantity roles',async(t)=>{
 for(const [zh,en] of [
  ['中国近六成家庭户不超过两个人','Nearly 70% of Chinese households have no more than two people'],
  ['中国近六成家庭户不超过两个人','Nearly 60% of Chinese households have no more than three people'],
  ['三人获奖','Five people won awards'],
  ['年龄60岁，金额70元','Age 70, amount 60 yuan'],
  ['六成家庭','6% of households'],
  ['三分之一的家庭','Two-thirds of households'],
  ['热度两千万','Heat 20 billion'],
  ['标题','Title 60'],
 ])await t.test(zh+' ≠ '+en,()=>assert.throws(()=>validateShareTranslation(copy(en),copy(zh)),/Changed numerical facts/));
});
