import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {generateShareEn,shareEnRevision,sourceFingerprint,validateShareEn} from '../src/lib/shareen';

const report=fixture('2026-11-15');
report.topics=Array.from({length:4},(_,i)=>({...report.topics[0],id:`topic-${i+1}`,rank:i+1,title:`话题 ${i+1}`}));
delete report.shareEnglish;
function draft(){return {
 overview:{headline:'China in context',summary:'A day of science and culture.',topics:report.topics.map((t,i)=>({id:t.id,title:`Story ${i+1}`}))},
 highlights:[4,2].map(i=>({topicId:`topic-${i}`,hook:'A closer look',whatHappened:'A story attracted attention.',context:'The available report provides background.',whyItMatters:'It could matter to readers abroad.',battle:{redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want a clear explanation.',blueRationale:'Others want to verify the report.',redScore:40,blueScore:60}})),
 top3:[1,2,3].map(i=>({topicId:`topic-${i}`,summary:`Original daily story ${i}`})),
 posts:[{id:'digest',template:'daily_digest',text:'Science meets culture.',reason:'条目多元'},{id:'bridge',template:'global_bridge',text:'A view from China.',reason:'海外关联'}],selectedPostId:'bridge',
 altTexts:['Four ranked news topics.','The fourth ranked topic explained.','The second ranked topic explained.']
};}
test('ShareEn captions describe selected focus cards while highlights keep their original IDs',async(t)=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test';let requests=0;
 globalThis.fetch=async()=>{requests++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft())}}]});};
 try {
  const copy=await generateShareEn(report);
  assert.ok(copy);assert.equal(requests,1);
  assert.deepEqual(copy.highlights.map(h=>h.topicId),['topic-4','topic-2']);
  assert.equal(copy.sourceFingerprint,sourceFingerprint(report));
  for(const post of copy.posts){assert.ok(post.text.startsWith('WcCAT Daily Hot\n'));assert.match(post.text,/1️⃣ Story 4/);assert.match(post.text,/2️⃣ Original daily story 2/);assert.ok(!post.text.includes('3️⃣'));assert.match(post.text,/WcCAT.*cards/);}
  await t.test('source identity ignores sharing caches but changes with Chinese content',()=>{
   assert.equal(sourceFingerprint({...report,shareEn:copy}),sourceFingerprint(report));
   assert.notEqual(sourceFingerprint({...report,headline:'新标题'}),sourceFingerprint(report));
  });
  await t.test('editing revisions are stable across object key order and change with saved copy',()=>{
   assert.match(shareEnRevision(undefined),/^[a-f0-9]{64}$/);
   assert.equal(shareEnRevision(copy),shareEnRevision({...copy,overview:{topics:copy.overview.topics,summary:copy.overview.summary,headline:copy.overview.headline}}));
   assert.notEqual(shareEnRevision(copy),shareEnRevision({...copy,overview:{...copy.overview,headline:'A newly edited headline'}}));
  });
  await t.test('usable same-source cache requires no model call',async()=>{
   assert.deepEqual(await generateShareEn({...report,shareEn:copy}),copy);assert.equal(requests,1);
  });
  await t.test('wrong ordered identities, repeated highlights and missing fields block validation',()=>{
   assert.throws(()=>validateShareEn({...copy,overview:{...copy.overview,topics:[...copy.overview.topics].reverse()}},report),/identity|order/i);
   assert.throws(()=>validateShareEn({...copy,highlights:[copy.highlights[0],copy.highlights[0]]},report),/duplicate/i);
   assert.throws(()=>validateShareEn({...copy,top3:copy.top3.slice(1)},report),/top3/i);
   assert.throws(()=>validateShareEn({...copy,highlights:[{...copy.highlights[0],whatHappened:''},copy.highlights[1]]},report),/whatHappened/i);
   assert.throws(()=>validateShareEn({...copy,posts:copy.posts.map(p=>({...p,text:'Unbranded'}))},report),/brand/i);
  });
  await t.test('numerical differences and long natural English are advisory',()=>{
   const warnings:string[]=[];
   const longer={...copy,overview:{...copy.overview,summary:'A story with 600 people. '+('A readable explanation. '.repeat(100))}};
   assert.ok(validateShareEn(longer,report,{onWarning:m=>warnings.push(m)}));assert.ok(warnings.length);
  });
  await t.test('numerical parser limitations never reject a structurally complete copy',()=>{
   const source={...report,overview:'零分之一'};
   const warnings:string[]=[];
   const copyForSource={...copy,sourceFingerprint:sourceFingerprint(source)};
   assert.ok(validateShareEn(copyForSource,source,{onWarning:m=>warnings.push(m)}));
   assert.ok(warnings.length);
  });
  await t.test('invalid structure gets one corrective retry and no more',async()=>{
   let attempts=0;
   globalThis.fetch=async()=>{attempts++;return Response.json({choices:[{message:{content:JSON.stringify(attempts===1?{...draft(),highlights:[]} : {highlightIds:draft().highlights.map(h=>h.topicId),topics:Object.fromEntries(draft().highlights.map(h=>[h.topicId,h]))})}}]});};
   assert.ok(await generateShareEn(report));assert.equal(attempts,2);
   attempts=0;globalThis.fetch=async()=>{attempts++;return Response.json({choices:[{message:{content:'{}'}}]});};
   assert.equal(await generateShareEn(report),undefined);assert.equal(attempts,2);
  });
  await t.test('HTTP errors do not retry and fewer than two topics skip the model',async()=>{
   let attempts=0;globalThis.fetch=async()=>{attempts++;return new Response('',{status:503});};
   assert.equal(await generateShareEn(report),undefined);assert.equal(attempts,1);
   assert.equal(await generateShareEn({...report,topics:report.topics.slice(0,1)}),undefined);assert.equal(attempts,1);
  });
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
