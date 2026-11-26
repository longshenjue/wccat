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

test('generation supplies the same limits as validation and treats them as editing metadata',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  let calls=0;
  await generateTopicShare(spaceSource(),{column:'inside',fetch:async(_url,options)=>{
   calls++;const payload=JSON.parse(JSON.parse(String(options?.body)).messages.at(-1).content);
   assert.deepEqual(payload.copyContract,TOPIC_SHARE_CONTRACT);
   assert.equal(payload.copyContract.en.headline.maxWords,18);assert.equal(payload.copyContract.en.headline.maxChars,200);
   assert.equal(payload.copyContract.zh.post.maxChars,140);assert.equal(payload.copyContract.en.post.maxChars,280);
   assert.ok(!payload.allowedPatterns.includes('source_voice'));assert.ok(payload.source.numericalEvidence.numbers.includes('24/1'));
   return response(spaceContent());
  }});assert.equal(calls,1);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
