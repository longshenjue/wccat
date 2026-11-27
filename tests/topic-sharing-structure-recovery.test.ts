import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTopicShare} from '../src/lib/topic-sharing/generation';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import {spaceSource} from './helpers/topic-sharing-space-fixture';

const response=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
function draft(){
 const copy=topicShareCopy(spaceSource());
 copy.en.article={title:'A reported development',body:'The source describes a concrete development.\n\n## Our take\n\nPublish the documented details.'};
 copy.zh.article={title:'事件进展',body:'来源说明了具体进展。\n\n## WcCAT点评\n\n应当公开已经核实的细节。'};
 return {column:'inside',en:copy.en,zh:copy.zh};
}

test('localized article field errors receive one structure repair that preserves copy and server identities',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='offline-structure-key';
 try{
  for(const language of ['en','zh'] as const){
   const source=spaceSource(),before=structuredClone(source),correct=draft(),broken=structuredClone(correct);
   const {body,...article}=broken[language].article!;
   Object.assign(broken[language],{article:{...article,body_zh:body}});
   let calls=0;const logs:string[]=[];
   const copy=await generateTopicShare(source,{column:'inside',fetch:async(_url,options)=>{
    calls++;
    if(calls===1)return response(broken);
    const request=JSON.parse(String(options?.body));
    assert.equal(request.temperature,0);
    assert.match(request.messages[0].content,/structur|schema/i);
    assert.match(request.messages[0].content,/preserve.*wording/i);
    const repair=JSON.parse(request.messages[1].content);
    assert.deepEqual(repair.invalidDraft,broken);
    return response(correct);
   },log:(_level,message)=>logs.push(message)});
   assert.equal(calls,2);assert.deepEqual(copy.en,correct.en);assert.deepEqual(copy.zh,correct.zh);
   assert.equal(copy.sourceFingerprint,source.fingerprint);assert.deepEqual(source,before);
   assert.ok(logs.some(message=>message.includes('结构')));
   assert.ok(!logs.join('').includes(body));assert.ok(!logs.join('').includes('offline-structure-key'));
  }
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});

test('serialization and schema recovery share one attempt and never form a retry loop',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='offline-structure-key';
 try{
  for(const firstSyntax of [false,true]){
   const broken=draft();Object.assign(broken.en.article!,{body_zh:'unexpected article field'});
   let calls=0;
   await assert.rejects(generateTopicShare(spaceSource(),{fetch:async()=>{
    calls++;
    return firstSyntax&&calls===1?Response.json({choices:[{message:{content:'{"en":'}}]}):response(broken);
   }}),/Unexpected.*en\.article\.body_zh/);
   assert.equal(calls,2);
  }
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});

test('source-owned metadata remains a hard error even beside a repairable article field',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='offline-structure-key';
 try{
  const broken=draft();Object.assign(broken.en.article!,{body_zh:'extra copy',sourceFingerprint:'forged'});
  let calls=0;
  await assert.rejects(generateTopicShare(spaceSource(),{fetch:async()=>{calls++;return response(broken);}}),/sourceFingerprint/);
  assert.equal(calls,1);
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});

test('hard errors anywhere in a draft are screened before an earlier article shape failure can trigger recovery',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='offline-structure-key';
 try{
  for(const kind of ['metadata','control'] as const){
   const broken=draft();Object.assign(broken.en.article!,{body_zh:'extra copy'});
   if(kind==='metadata')Object.assign(broken.zh,{sourceFingerprint:'forged'});
   else broken.zh.headline+='\u202e';
   let calls=0;
   await assert.rejects(generateTopicShare(spaceSource(),{fetch:async()=>{
    calls++;return response(calls===1?broken:draft());
   }}),kind==='metadata'?/sourceFingerprint/:/Unsafe control/);
   assert.equal(calls,1);
  }
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});

test('malformed copy containers can be repaired without retrying editorial wording warnings',async()=>{
 const old=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='offline-structure-key';
 try{
  const correct=draft();correct.en.summary='A reported event with 中文 in its name.';
  let calls=0;
  const copy=await generateTopicShare(spaceSource(),{fetch:async()=>{
   calls++;return response(calls===1?{...correct,en:{...correct.en,posts:'invalid array'}}:correct);
  }});
  assert.equal(calls,2);assert.equal(copy.en.summary,correct.en.summary);
 }finally{if(old===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old;}
});
