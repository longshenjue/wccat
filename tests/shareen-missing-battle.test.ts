import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {shareEnDraft} from './helpers/shareen-fixture';
import {generateShareEn} from '../src/lib/shareen';

const english={redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want a clear explanation.',blueRationale:'Others want to verify the report.',redScore:80,blueScore:20};
test('missing emotional opposition is repaired once without rewriting news or inventing unsupported scores',async t=>{
 const report=fixture('2026-11-16');
 report.shareEnglish=undefined;
 report.topics=[report.topics[0],{...structuredClone(report.topics[0]),id:'second',rank:5,aiAnalysis:undefined}];
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='fixture-only';
 try{
  await t.test('omitted Chinese-source battle is translated with original scores',async()=>{
   const initial=shareEnDraft(report,{omitBattle:true});Object.assign(initial.highlights[1],{battle:null});
   const logs:string[]=[],requests:Record<string,unknown>[]=[];
   globalThis.fetch=async(_url,init)=>{
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({choices:[{message:{content:JSON.stringify(requests.length===1?initial:{topics:{'topic-one':{battle:english,whatHappened:'Unrequested overwrite'}}})}}]});
   };
   const copy=await generateShareEn(report,(_level,message)=>logs.push(message));assert.ok(copy);
   assert.equal(requests.length,2);
   assert.deepEqual(copy.highlights[0].battle,{...english,redScore:40,blueScore:60,basis:'analysis'});
   assert.equal(copy.highlights[0].whatHappened,initial.highlights[0].whatHappened);
   assert.match(logs.join('\n'),/#1.*情绪条.*已有分析/u);
   assert.match(logs.join('\n'),/#5.*材料不足/u);
  });
  await t.test('missing unanalysed attitude gets one attempt and a labeled estimate',async()=>{
   const source={...report,topics:report.topics.map(topic=>({...topic,aiAnalysis:undefined}))};
   const initial=shareEnDraft(source,{omitBattle:true}),logs:string[]=[];let calls=0;
   globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(++calls===1?initial:{topics:{'topic-one':{battle:english},second:{battle:null}}})}}]});
   const copy=await generateShareEn(source,(_level,message)=>logs.push(message));assert.ok(copy);
   assert.equal(calls,2);assert.equal(copy.highlights[0].battle?.basis,'estimate');
   assert.equal(copy.highlights[1].battle,undefined);
   assert.match(logs.join('\n'),/#1.*AI 估计/u);assert.match(logs.join('\n'),/#5.*材料不足/u);
  });
  await t.test('explicit null without source analysis avoids retry and fabricated balance',async()=>{
   const source={...report,topics:report.topics.map(topic=>({...topic,aiAnalysis:undefined}))};
   const initial=shareEnDraft(source,{omitBattle:true});initial.highlights.forEach(h=>Object.assign(h,{battle:null}));let calls=0;
   globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(initial)}}]});};
   const copy=await generateShareEn(source);assert.ok(copy);assert.equal(calls,1);
   assert.ok(copy.highlights.every(h=>h.battle===undefined));
  });
  await t.test('null cannot silently discard existing Chinese analysis and failed repair preserves copy',async()=>{
   const initial=shareEnDraft(report,{omitBattle:true});initial.highlights.forEach(h=>Object.assign(h,{battle:null}));
   const logs:string[]=[];let calls=0;
   globalThis.fetch=async()=>++calls===1?Response.json({choices:[{message:{content:JSON.stringify(initial)}}]}):new Response('',{status:503});
   const copy=await generateShareEn(report,(_level,message)=>logs.push(message));assert.ok(copy);
   assert.equal(calls,2);assert.equal(copy.highlights[0].battle,undefined);
   assert.equal(copy.highlights[0].whatHappened,initial.highlights[0].whatHappened);
   assert.match(logs.join('\n'),/#1.*补齐未成功/u);
  });
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
