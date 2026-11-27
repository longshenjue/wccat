import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTopicShare} from '../src/lib/topic-sharing/generation';
import {assertNoTopicShareReviewWarnings} from '../src/lib/topic-sharing/validation';
import {spaceContent,spaceSource} from './helpers/topic-sharing-space-fixture';
import type {LocalizedTopicShare} from '../src/lib/topic-sharing/types';
import {TOPIC_SHARE_CONTRACT} from '../src/lib/topic-sharing/contract';

const response=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
function validate(value:{column:string;en:LocalizedTopicShare;zh:LocalizedTopicShare}){
 const source=spaceSource();
 return assertNoTopicShareReviewWarnings({...value,version:1,generatedAt:source.observedAt,model:'test',sourceFingerprint:source.fingerprint},source);
}

test('editorial validation reports every failing field instead of stopping at the first text limit',()=>{
 const value=spaceContent();
 value.en.summary=Array(71).fill('material').join(' ');
 value.en.hook='An update with 中文 mixed in.';
 value.en.posts[2].text='One handshake became a cultural talking point.';
 value.zh.context='网友表示所有人都支持这次任务。';
 try{validate(value);assert.fail('expected content issues');}
 catch(error){
  const failure=error as Error&{issues?:Array<{path:string}>};
  assert.ok(failure.issues,'structured editable issue list');
  const paths=new Set(failure.issues.map(issue=>issue.path));
  assert.deepEqual(paths,new Set(['en.summary','en.hook','en.posts[2].text','zh.context']));
 }
});

test('generation keeps task instructions compact and avoids redundant numerical evidence inventories',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  let calls=0;
  await generateTopicShare(spaceSource(),{column:'inside',fetch:async(_url,options)=>{
   calls++;const payload=JSON.parse(JSON.parse(String(options?.body)).messages.at(-1).content);
   assert.equal(payload.copyContract,undefined);assert.equal(payload.source.numericalEvidence,undefined);
   assert.equal(payload.source.title,spaceSource().title);assert.equal(payload.source.sourceReportDate,spaceSource().date);
   assert.ok(!payload.allowedPatterns.includes('source_voice'));
   return response(spaceContent());
  }});assert.equal(calls,1);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('a broken JSON envelope gets one serialization-only retry while editorial doubts never trigger it',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='format-test-key';let calls=0;
 try{
  const original=spaceContent();original.en.summary='One astronaut recited 登鹳雀楼.';
  const copy=await generateTopicShare(spaceSource(),{fetch:async(_url,options)=>{calls++;if(calls===1)return Response.json({choices:[{finish_reason:'stop',message:{content:'{"en":{"headline":"An unescaped "quote""}}'}}]});const payload=JSON.parse(String(options?.body));assert.match(payload.messages[0].content,/serialization|JSON syntax/i);assert.match(payload.messages[0].content,/preserve.*wording/i);return response(original);}});
  assert.equal(calls,2);assert.equal(copy.en.summary,original.en.summary);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
