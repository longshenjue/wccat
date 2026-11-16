import test from 'node:test';
import assert from 'node:assert/strict';
import {translateDailyShare} from '../src/lib/daily-share-translation';
import {report} from './helpers/data-fixtures';

test('translation retries structural failures but accepts advisory numerical differences',async(t)=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test-only-key';
 const source=report('2026-11-13');
 source.topics[0].aiAnalysis!.detailedContent='2027年考试安排在2026年12月19日至20日。';
 const valid=structuredClone(source.shareEnglish!);
 valid.analysis!.detailedContent='The 2027 exam is on December 19–20, 2026.';
 const invalid={...valid,overview:''};
 try{
  await t.test('uses validation feedback to repair missing English copy',async()=>{
   let calls=0;const requests:Record<string,unknown>[]=[];
   globalThis.fetch=async(_url,options)=>{calls++;requests.push(JSON.parse(String(options?.body)));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?invalid:valid)}}]});};
   assert.deepEqual(await translateDailyShare(source),valid);
   assert.equal(calls,2);
   assert.match(JSON.stringify(requests[1]),/overview/);
  });
  await t.test('does not retry HTTP authentication failures',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:401});};
   assert.equal(await translateDailyShare(source),undefined);assert.equal(calls,1);
  });
  await t.test('stops after two structurally invalid outputs without publishing either',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(invalid)}}]});};
   assert.equal(await translateDailyShare(source),undefined);assert.equal(calls,2);
  });
  await t.test('valid first output needs only one API request',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(valid)}}]});};
   assert.deepEqual(await translateDailyShare(source),valid);assert.equal(calls,1);
  });
  await t.test('date differences stay available and emit an accepted info message without retry',async()=>{
   const english=structuredClone(valid);english.analysis!.detailedContent='In 2026 the 2027 exam is on December 19–20.';
   let calls=0;const logs:Array<{level:string;message:string}>=[];
   globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(english)}}]});};
   assert.deepEqual(await translateDailyShare(source,(level,message)=>logs.push({level,message})),english);
   assert.equal(calls,1);assert.equal(logs.length,1);assert.equal(logs[0].level,'info');
   assert.match(logs[0].message,/已接受，不重试/);assert.match(logs[0].message,/analysis\.detailedContent/);
  });
  await t.test('the real TOP8 title translates successfully without retry or numeric notices',async()=>{
   const input=structuredClone(source);input.topics[0].title='中国近六成家庭户不超过两个人';
   const english=structuredClone(valid);english.topics[0].title='Nearly 60% of Chinese households have no more than two people';
   let calls=0;const logs:string[]=[];
   globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(english)}}]});};
   assert.deepEqual(await translateDailyShare(input,(_level,message)=>logs.push(message)),english);
   assert.equal(calls,1);assert.deepEqual(logs,[]);
  });
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});
