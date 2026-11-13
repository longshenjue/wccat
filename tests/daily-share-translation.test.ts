import test from 'node:test';
import assert from 'node:assert/strict';
import {translateDailyShare} from '../src/lib/daily-share-translation';
import {report} from './helpers/data-fixtures';

test('translation repairs one invalid output with bounded calls and keeps strict year validation',async(t)=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test-only-key';
 const source=report('2026-11-13');
 source.topics[0].aiAnalysis!.detailedContent='2027年考试安排在2026年12月19日至20日。';
 const valid=structuredClone(source.shareEnglish!);
 valid.analysis!.detailedContent='The 2027 exam is on December 19–20, 2026.';
 const invalid=structuredClone(valid);
 invalid.analysis!.detailedContent='In 2026 the 2027 exam is on December 19–20.';
 try{
  await t.test('uses validation feedback to repair a date/year association',async()=>{
   let calls=0;const requests:Record<string,unknown>[]=[];
   globalThis.fetch=async(_url,options)=>{calls++;requests.push(JSON.parse(String(options?.body)));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(calls===1?invalid:valid)}}]});};
   assert.deepEqual(await translateDailyShare(source),valid);
   assert.equal(calls,2);
   assert.match(JSON.stringify(requests[1]),/analysis\.detailedContent/);
  });
  await t.test('does not retry HTTP authentication failures',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:401});};
   assert.equal(await translateDailyShare(source),undefined);assert.equal(calls,1);
  });
  await t.test('stops after two invalid model outputs without publishing either',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(invalid)}}]});};
   assert.equal(await translateDailyShare(source),undefined);assert.equal(calls,2);
  });
  await t.test('valid first output needs only one API request',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(valid)}}]});};
   assert.deepEqual(await translateDailyShare(source),valid);assert.equal(calls,1);
  });
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});
