import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {shareEnDraft} from './helpers/shareen-fixture';
import {generateShareEn} from '../src/lib/shareen';
import {shareEnTextFiles} from '../src/lib/share-export';

const b={redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want a clear explanation.',blueRationale:'Others prefer to wait for verified facts.',redScore:80,blueScore:20};
test('ShareEn creates compact emotional opposition in the same bounded generation pipeline',async(t)=>{
 const report=fixture('2026-11-15');report.topics=[...report.topics,{...report.topics[0],id:'second',rank:2,aiAnalysis:undefined}];
 function draft(){const data=shareEnDraft(report);return {...data,highlights:data.highlights.map(h=>({...h,battle:{...b}}))};}
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-debate';
 try{
  await t.test('existing source scores win, while topics without analysis get labeled estimates',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(draft())}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,1);
   assert.equal(copy.highlights[0].battle?.redScore,40);assert.equal(copy.highlights[0].battle?.basis,'analysis');
   assert.equal(copy.highlights[1].battle?.redScore,80);assert.equal(copy.highlights[1].battle?.basis,'estimate');
   assert.match(copy.altTexts[1],/Demand accountability/);
  });
  await t.test('exported alt text follows current edited attitudes and preserves the manual description',async()=>{
   globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(draft())}}]});
   const copy=await generateShareEn(report);assert.ok(copy);copy.highlights[0].battle!.redLabel='Demand transparency';
   copy.altTexts[1]='My own image description. Debate energy (existing AI analysis): Old label 40, Other old label 60.';
   const alt=new TextDecoder().decode(shareEnTextFiles(report,copy).find(f=>f.name==='alt-text.txt')!.data);
   assert.ok(alt.includes('My own image description.'));assert.ok(alt.includes('Demand transparency'));assert.ok(!alt.includes('Old label'));assert.ok(!alt.includes('Other old label'));
  });
  await t.test('an incomplete optional battle is patched without replacing good article text',async()=>{
   const initial=draft();initial.highlights[1].battle.redLabel='中文';let calls=0;
   globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(calls===1?initial:{topics:{second:{battle:b,whatHappened:'Unrequested rewrite'}}})}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.highlights[1].battle?.redLabel,b.redLabel);assert.equal(copy.highlights[1].whatHappened,initial.highlights[1].whatHappened);
  });
  await t.test('unusable optional battle does not reject a complete article or invent a fake split',async()=>{
   const initial=draft();initial.highlights[1].battle.redLabel='中文';let calls=0;
   globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(calls===1?initial:{})}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.highlights[1].battle,undefined);assert.ok(copy.highlights[0].battle);
  });
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
