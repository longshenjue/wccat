import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTopicShare} from '../src/lib/topic-sharing/generation';
import {spaceContent,spaceSource} from './helpers/topic-sharing-space-fixture';
import {prepareTopicShareDraft,validateTopicShareCopy} from '../src/lib/topic-sharing/validation';
import {handshakeSource,handshakeContent} from './helpers/topic-sharing-handshake-fixture';
import {usableTopicQuotes} from '../src/lib/topic-sharing/recommendation';
import type {LocalizedTopicShare} from '../src/lib/topic-sharing/types';
import {updateSelectedTopicSharePost} from '../src/lib/topic-sharing/client-state';

function assessed(value:unknown,source=spaceSource()){
 return prepareTopicShareDraft({version:1,generatedAt:source.observedAt,model:'test',sourceFingerprint:source.fingerprint,...value as object},source);
}

test('core translation and evidence doubts preserve the original bilingual draft after one request',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='warning-policy-test-key';
 try{
  const value=spaceContent();
  value.en.summary='One astronaut recited 登鹳雀楼. The post calls it “A Chinese poem in space”.';
  value.en.context='The comments show support from 999 million viewers.';
  value.zh.summary='保存材料描述了一次航天任务，具体英文表达由管理员核对。';
  let calls=0;
  const result=await generateTopicShare(spaceSource(),{fetch:async()=>{
   calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
  }});
  assert.equal(calls,1,'editorial checks cannot trigger a rewrite or a failed repair');
  assert.deepEqual(result.en,value.en);assert.deepEqual(result.zh,value.zh);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('all editorial categories are warnings, including overlong core copy and plain-text link concerns',()=>{
 const value:{column:string;en:LocalizedTopicShare;zh:LocalizedTopicShare}=spaceContent();value.en.summary='One astronaut recited 登鹳雀楼 and called it “A poem in space”.';
 value.en.context='All users support the mission; the comments show support from 999 million people.';
 value.zh.context='材料说明。'.repeat(60);value.en.replies=['Source data: this is explanatory text. Read https://example.test/other'];
 const before=structuredClone(value),result=assessed(value),codes=new Set(result.reviewWarnings.map(item=>item.code));
 for(const code of ['numerical','language','quotation','population','comment_evidence','length','link'])assert.ok(codes.has(code),code);
 assert.deepEqual(value,before);assert.deepEqual(result.copy.en,value.en);assert.deepEqual(result.copy.zh,value.zh);
 assert.equal(validateTopicShareCopy({...result.copy},spaceSource()).en.summary,value.en.summary);
});

test('diagnostic parser failures and missing language fields cannot reject an editable draft',()=>{
 const value=spaceContent();value.en.context='The source describes zero out of zero cases.';
 assert.ok(assessed(value).reviewWarnings.some(item=>item.code==='review_unavailable'));
 const incomplete={...spaceContent(),en:undefined};
 const result=assessed(incomplete);assert.equal(result.copy.en.summary,'');assert.ok(result.copy.en.posts.length);
 assert.deepEqual(result.copy.zh,incomplete.zh);assert.ok(result.reviewWarnings.some(item=>item.path==='en.summary'&&item.code==='missing_text'));
 const before=structuredClone(result.copy.en),edited=updateSelectedTopicSharePost(result.copy.en,'A manually reviewed caption.');
 assert.equal(edited.posts[0].text,'A manually reviewed caption.');assert.equal(edited.selectedPostId,edited.posts[0].id);
 assert.deepEqual(result.copy.en,before,'editing cannot mutate the saved draft');
});

test('a real Chinese comment remains usable without an English translation',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='warning-policy-test-key';
 try{
  const source=handshakeSource();delete source.commentExamples!.red!.englishText;
  assert.equal(usableTopicQuotes(source,'zh').length,1);assert.equal(usableTopicQuotes(source,'en').length,0);
  const content=handshakeContent();let calls=0;
  const copy=await generateTopicShare(source,{column:'voices',fetch:async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(content)}}]});}});
  assert.equal(calls,1);assert.equal(copy.column,'voices');assert.ok(prepareTopicShareDraft(copy,source).reviewWarnings.some(item=>item.code==='comment_translation'));
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('stored comment translations containing Chinese names remain visible for human review',()=>{
 const source=handshakeSource();source.commentExamples!.red!.englishText='An astronaut visited 天宫.';
 assert.equal(usableTopicQuotes(source,'en')[0]?.text,'An astronaut visited 天宫.');
 const content=handshakeContent(),result=assessed(content,source);
 assert.ok(result.reviewWarnings.some(item=>item.path==='source.commentTranslation'&&item.code==='language'));
});

test('source identity and source-owned fields remain protected regardless of editorial policy',()=>{
 const source=spaceSource(),copy={...spaceContent(),version:1,generatedAt:source.observedAt,model:'test',sourceFingerprint:source.fingerprint};
 assert.throws(()=>prepareTopicShareDraft({...copy,sourceFingerprint:'b'.repeat(64)},source),/fingerprint/i);
 assert.throws(()=>prepareTopicShareDraft({...copy,links:[]},source),/owned|unknown/i);
 assert.throws(()=>prepareTopicShareDraft({...copy,en:{...copy.en,comments:[]}},source),/owned|unknown/i);
 assert.throws(()=>prepareTopicShareDraft({...copy,en:{...copy.en,hook:'A hidden\u0000 instruction'}},source),/control/i);
});
