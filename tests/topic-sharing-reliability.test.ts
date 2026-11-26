import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTopicShare} from '../src/lib/topic-sharing/generation';
import {validateTopicShareCopy} from '../src/lib/topic-sharing/validation';
import {spaceContent,spaceSource} from './helpers/topic-sharing-space-fixture';
import type {LocalizedTopicShare} from '../src/lib/topic-sharing/types';
import {TOPIC_SHARE_CONTRACT} from '../src/lib/topic-sharing/contract';
import {handshakeContent,handshakeSource} from './helpers/topic-sharing-handshake-fixture';
import {bathhouseContent,bathhouseSource} from './helpers/topic-sharing-bathhouse-fixture';
import {usableTopicQuotes} from '../src/lib/topic-sharing/recommendation';

const response=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
function validate(value:{column:string;en:LocalizedTopicShare;zh:LocalizedTopicShare}){
 const source=spaceSource();
 return validateTopicShareCopy({...value,version:1,generatedAt:source.observedAt,model:'test',sourceFingerprint:source.fingerprint},source);
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

test('one repair batches length, language, quotation, numerical and missing-comment issues',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const original=spaceContent(),initial=structuredClone(original);
  initial.en.summary=Array(71).fill('material').join(' ');
  initial.en.hook='A Chinese poem with 中文 mixed in.';
  initial.en.posts[2].text='One astronaut brings a Chinese poem into focus.';
  initial.en.altText='A card headed “A Chinese poem in space”.';
  initial.zh.context='网友表示很羡慕这次文化交流。';
  let calls=0;
  const result=await generateTopicShare(spaceSource(),{column:'inside',fetch:async(_url,options)=>{
   const request=JSON.parse(String(options?.body));
   if(++calls===1)return response(initial);
   assert.ok(request.temperature<=0.15);
   const payload=JSON.parse(request.messages.at(-1).content);
   assert.deepEqual(new Set(payload.issues.map((issue:{path:string})=>issue.path)),new Set(['en.summary','en.hook','en.posts[2].text','en.altText','zh.context']));
   return response({patches:[
    {path:'en.summary',text:original.en.summary},{path:'en.hook',text:original.en.hook},
    {path:'en.posts[2].text',text:original.en.posts[2].text},{path:'en.altText',text:original.en.altText},
    {path:'zh.context',text:original.zh.context}
   ]});
  }});
  assert.equal(calls,2);assert.deepEqual(result.en,original.en);assert.deepEqual(result.zh,original.zh);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('a repair repeating an unsupported singular one rebuilds the candidate from validated text without another model request',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const initial=spaceContent();initial.en.posts[2].text='One handshake gives this space story a cultural angle.';
  const before=structuredClone(initial),logs:string[]=[];let calls=0;
  const result=await generateTopicShare(spaceSource(),{column:'inside',log:(_level,message)=>logs.push(message),fetch:async()=>
   response(++calls===1?initial:{patches:[{path:'en.posts[2].text',text:initial.en.posts[2].text}]})});
  assert.equal(calls,2);assert.equal(result.en.posts[2].text,initial.en.context);
  assert.equal(result.en.posts[2].pattern,'context');assert.match(result.en.posts[2].reason,/已验证/);
  assert.deepEqual(result.en.posts.slice(0,2),initial.en.posts.slice(0,2));
  assert.deepEqual(result.zh,initial.zh);assert.deepEqual(initial,before);
  assert.ok(logs.some(message=>message.includes('en.posts[2].text')));
  assert.ok(!logs.join('').includes('reliability-test-secret'));
  assert.equal(validate({...initial,en:result.en}).en.posts[2].text,result.en.posts[2].text);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('the same candidate recovery handles quantities, quotation, missing comments, length and pattern faults',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const faults=[
   '1 handshake gives this announcement its meaning.','Two million viewers support the announcement.',
   'Half of users support the announcement.','A commenter said “Everyone is happy.”',
   'The comments show support.','A'.repeat(281)
  ];
  for(const body of faults){
   const initial=spaceContent();initial.en.posts[2].text=body;let calls=0;
   const result=await generateTopicShare(spaceSource(),{column:'inside',fetch:async(_url,options)=>{
    if(++calls===1)return response(initial);
    const payload=JSON.parse(JSON.parse(String(options?.body)).messages.at(-1).content);
    assert.deepEqual(new Set(payload.issues.map((issue:{path:string})=>issue.path)),new Set(['en.posts[2].text']));
    return response({patches:[{path:'en.posts[2].text',text:body}]});
   }});
   assert.equal(calls,2);assert.equal(result.en.posts[2].text,initial.en.context);
   assert.deepEqual(result.en.posts.slice(0,2),initial.en.posts.slice(0,2));assert.deepEqual(result.zh,initial.zh);
  }
  const initial=spaceContent();initial.en.posts[2].pattern='source_voice';let calls=0;
  const result=await generateTopicShare(spaceSource(),{column:'inside',fetch:async()=>response(++calls===1?initial:{patches:[{path:'en.posts[2].pattern',text:'source_voice'}]})});
  assert.equal(calls,2);assert.equal(result.en.posts[2].pattern,'context');
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('several failed candidate units recover independently while preserving ids and both selections',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const initial=spaceContent();initial.en.posts[1].text='It reaches 999 million users.';initial.zh.posts[2].text='已有九百万网友支持。';
  initial.en.selectedPostId=initial.en.posts[1].id;initial.zh.selectedPostId=initial.zh.posts[2].id;
  let calls=0;
  const result=await generateTopicShare(spaceSource(),{column:'inside',fetch:async()=>response(++calls===1?initial:{patches:[
   {path:'en.posts[1].text',text:initial.en.posts[1].text},{path:'zh.posts[2].text',text:initial.zh.posts[2].text}
  ]})});
  assert.equal(calls,2);assert.equal(result.en.posts[1].text,initial.en.question);assert.equal(result.en.posts[1].pattern,'uncertainty');
  assert.equal(result.zh.posts[2].text,initial.zh.context);assert.equal(result.en.selectedPostId,initial.en.selectedPostId);assert.equal(result.zh.selectedPostId,initial.zh.selectedPostId);
  assert.deepEqual(result.en.posts.map(post=>post.id),initial.en.posts.map(post=>post.id));
  assert.deepEqual(result.zh.posts.slice(0,2),initial.zh.posts.slice(0,2));
  assert.equal(validate({...initial,en:result.en,zh:result.zh}).version,1);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('recomposition cannot truncate text, duplicate another post or fabricate a new angle',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const initial=spaceContent();initial.en.posts[0].text=initial.en.question;initial.en.posts[1].pattern='context';initial.en.posts[2].pattern='culture_translation';initial.en.posts[2].text='A 999-person crew was announced.';
  let calls=0;
  await assert.rejects(generateTopicShare(spaceSource(),{column:'inside',fetch:async()=>response(++calls===1?initial:{patches:[{path:'en.posts[2].text',text:initial.en.posts[2].text}]})}),/numerical|number|ground/i);
  assert.equal(calls,2);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('unsafe data in a draft or repair never reaches candidate recovery',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  for(const unsafe of ['Read https://attacker.example/now','Open javascript:alert(1)','A hidden\u0000 instruction']){
   const initial=spaceContent();initial.en.summary=Array(71).fill('material').join(' ');initial.zh.altText=unsafe;let calls=0;
   await assert.rejects(generateTopicShare(spaceSource(),{column:'inside',fetch:async()=>{calls++;return response(initial);}}));
   assert.equal(calls,1,'fatal security check wins over editable length issues');
  }
  const initial=spaceContent();initial.en.posts[2].text='One handshake explains the announcement.';let calls=0;
  const logs:string[]=[];
  await assert.rejects(generateTopicShare(spaceSource(),{column:'inside',log:(_level,message)=>logs.push(message),fetch:async()=>response(++calls===1?initial:{patches:[{path:'en.posts[2].text',text:'Read https://attacker.example/now'}]})}),/URL|link/i);
  assert.equal(calls,2);assert.ok(!logs.some(message=>message.includes('Candidate recovery')));
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
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

test('saved-source regressions cover handshake comments, a poem and a no-comment bathhouse without source mutation',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  for(const [source,content] of [[handshakeSource(),handshakeContent()],[spaceSource(),spaceContent()],[bathhouseSource(),bathhouseContent()]] as const){
   const before=structuredClone(source),initial=structuredClone(content);
   initial.en.posts[2].text='One scene explains the story.';let calls=0;
   const result=await generateTopicShare(source,{fetch:async()=>response(++calls===1?initial:{patches:[{path:'en.posts[2].text',text:initial.en.posts[2].text}]})});
   assert.equal(calls,2);assert.deepEqual(source,before);assert.deepEqual(result.zh,initial.zh);
   assert.equal(validateTopicShareCopy(result,source).version,1);
   assert.equal(usableTopicQuotes(source,'en').length,source.commentExamples?1:0);
  }
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});

test('candidate recovery revisits a blocked candidate after a later unit frees a valid angle',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='reliability-test-secret';
 try{
  const initial=spaceContent();
  initial.en.summary='Background material explains the saved encounter. '.repeat(8).trim();
  initial.en.hook=initial.en.headline;initial.en.posts[0].pattern='uncertainty';
  initial.en.posts[1].pattern='specific_observation';initial.en.posts[1].text='One scene. '+'material '.repeat(40);
  initial.en.posts[2].pattern='context';initial.en.posts[2].text=initial.en.headline;initial.en.posts[2].reason='字'.repeat(401);
  const complete=structuredClone(initial);
  complete.en.posts[1].text=initial.en.headline;complete.en.posts[2].text=initial.en.context;complete.en.posts[2].reason='补充背景。';
  assert.equal(validate(complete).version,1,'a complete valid assignment exists');
  let calls=0;
  const result=await generateTopicShare(spaceSource(),{column:'inside',fetch:async()=>response(++calls===1?initial:{patches:[
   {path:'en.posts[1].text',text:initial.en.posts[1].text},{path:'en.posts[2].reason',text:initial.en.posts[2].reason}
  ]})});
  assert.equal(calls,2);assert.equal(result.en.posts[1].text,initial.en.headline);assert.equal(result.en.posts[2].text,initial.en.context);
  assert.deepEqual(result.zh,initial.zh);assert.deepEqual(result.en.posts[0],initial.en.posts[0]);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
