import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {generateShareEn} from '../src/lib/shareen';
import {shareEnDraft} from './helpers/shareen-fixture';

const report=fixture('2026-11-15');
report.topics=Array.from({length:10},(_,i)=>({...report.topics[0],id:`topic-${i+1}`,rank:i+1,title:`中文话题${i+1}`}));
delete report.shareEnglish;
function keyed(){return {topics:Object.fromEntries(report.topics.map(t=>[t.id,{title:`Concrete story ${t.rank}`,hook:`Story ${t.rank} explained`,whatHappened:'The supplied report describes this event and its background.',whyItMatters:'It may help overseas readers understand the discussion.'}])),highlightIds:['topic-8','topic-1','topic-3'],posts:[{id:'digest',template:'daily_digest',text:'Today on the Chinese internet.',reason:'Three concrete stories'},{id:'bridge',template:'global_bridge',text:'China, in context.',reason:'For readers abroad'}],selectedPostId:'digest'};}

test('ShareEn repairs only missing fields and reuses original-rank titles for captions',async(t)=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test-field-repair';
 try{
  await t.test('keyed topic output needs no AI-owned overview, identities, Top3 or alt text',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(keyed())}}]});};
   const copy=await generateShareEn(report);
   assert.ok(copy);assert.equal(calls,1);
   assert.deepEqual(copy.overview.topics.map(t=>t.id),report.topics.map(t=>t.id));
   assert.equal(copy.overview.headline,"China’s Top 10");assert.equal(copy.overview.summary,'');
   assert.deepEqual(copy.top3.map(t=>t.summary),['Concrete story 1','Concrete story 2','Concrete story 3']);
   assert.deepEqual(copy.highlights.map(h=>h.topicId),['topic-8','topic-1','topic-3']);
   assert.equal(copy.altTexts.length,4);
  });
  await t.test('legacy partial/reordered list is matched by ID and filled from valid English cache',async()=>{
   const draft=shareEnDraft(report);
   draft.overview.topics=draft.overview.topics.slice(1).reverse();
   draft.top3[0].summary='BLG夺冠';
   const source={...report,shareEnglish:{...fixture(report.reportDate).shareEnglish!,topics:report.topics.map(t=>({id:t.id,title:`Cached English story ${t.rank}`,oneLine:'A report.',whyItMatters:'Background.',sources:[]}))}};
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(draft)}}]});};
   const copy=await generateShareEn(source);
   assert.ok(copy);assert.equal(calls,1);assert.equal(copy.overview.topics[0].title,'Cached English story 1');
   assert.equal(copy.top3[0].summary,'Cached English story 1');
   assert.deepEqual(copy.overview.topics.map(t=>t.id),report.topics.map(t=>t.id));
  });
  await t.test('second request patches missing title and invalid body without rewriting good content',async()=>{
   const initial=keyed();delete (initial.topics['topic-2'] as Partial<typeof initial.topics[string]>).title;
   initial.topics['topic-8'].whatHappened='';let calls=0;let repairPrompt='';
   globalThis.fetch=async(_url,init)=>{calls++;if(calls===1)return Response.json({choices:[{message:{content:JSON.stringify(initial)}}]});
    repairPrompt=String(init?.body);
    return Response.json({choices:[{message:{content:JSON.stringify({topics:{'topic-2':{title:'Repaired second story'},'topic-8':{whatHappened:'This repaired event explanation is complete.',title:'Unrequested overwrite'}}})}}]});};
   const copy=await generateShareEn(report);
   assert.ok(copy);assert.equal(calls,2);assert.equal(copy.overview.topics[1].title,'Repaired second story');
   assert.equal(copy.overview.topics[7].title,'Concrete story 8');
   assert.equal(copy.highlights[0].whatHappened,'This repaired event explanation is complete.');
   assert.match(repairPrompt,/repair/i);assert.match(repairPrompt,/topic-2/);assert.match(repairPrompt,/whatHappened/);
  });
  await t.test('unknown extras do not erase valid keyed copy or force another full draft',async()=>{
   const initial=keyed();initial.topics['not-a-source-id']={title:'An unrelated extra',hook:'Extra hook',whatHappened:'Extra content.',whyItMatters:'Extra rationale.'};
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(initial)}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,1);
   assert.deepEqual(copy.overview.topics.map(t=>t.id),report.topics.map(t=>t.id));assert.equal(copy.overview.topics[0].title,'Concrete story 1');
  });
  await t.test('duplicate legacy topic IDs quarantine only that title and retain good posts and fields',async()=>{
   const initial=shareEnDraft(report);initial.overview.topics.push({...initial.overview.topics[0],title:'Ambiguous duplicated title'});
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(calls===1?initial:{topics:{'topic-1':{title:'Unambiguous corrected title'}}})}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);
   assert.equal(copy.overview.topics[0].title,'Unambiguous corrected title');assert.equal(copy.overview.topics[1].title,'Daily story 2');
   assert.ok(copy.posts[0].text.includes('Science meets culture.'));
  });
  await t.test('duplicate highlights cannot keep an ambiguous body after a selection repair',async()=>{
   const initial=shareEnDraft(report),first=initial.highlights[0];
   initial.highlights=[first,{...first,whatHappened:'An ambiguous last duplicate.'},initial.highlights[1]];
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(calls===1?initial:{highlightIds:['topic-1','topic-2'],topics:{'topic-1':{hook:'A corrected hook',whatHappened:'A corrected unambiguous account.',whyItMatters:'A corrected explanation.'}}})}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.highlights[0].whatHappened,'A corrected unambiguous account.');
  });
  await t.test('a valid selected post survives when another candidate is invalid',async()=>{
   const initial=keyed();initial.posts=[{id:'good',template:'story_led',text:'Keep this selected hook.',reason:'Useful original choice'},{id:'bad',template:'daily_digest',text:'中文',reason:'Invalid'}];initial.selectedPostId='good';
   globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(initial)}}]});
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(copy.selectedPostId,'good');assert.ok(copy.posts.find(p=>p.id==='good')?.text.includes('Keep this selected hook.'));assert.equal(copy.posts.length,2);
  });
  await t.test('conflicting duplicate JSON topic keys are quarantined before object conversion',async()=>{
   const initial=keyed();const raw=JSON.stringify(initial).replace('"topics":{','"topics":{"topic-1":{"title":"Ambiguous earlier title"},');
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:calls===1?raw:JSON.stringify({topics:{'topic-1':{title:'Corrected original first title',hook:'A corrected first hook',whatHappened:'An unambiguous account of the first event.',whyItMatters:'An explanation for overseas readers.'}}})}}]});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.overview.topics[0].title,'Corrected original first title');assert.equal(copy.overview.topics[7].title,'Concrete story 8');
  });
  await t.test('an interrupted provider response body is not mistaken for missing model fields',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return new Response(new ReadableStream({start(c){c.error(new TypeError('terminated'));}}));};
   assert.equal(await generateShareEn(report),undefined);assert.equal(calls,1);
  });
  await t.test('optional shortening failure retains a complete usable draft',async()=>{
   const initial=keyed();initial.topics['topic-8'].whatHappened='A readable sentence explaining the supplied event. '.repeat(10);
   let calls=0;globalThis.fetch=async()=>{calls++;return calls===1?Response.json({choices:[{message:{content:JSON.stringify(initial)}}]}):new Response('',{status:503});};
   const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.highlights[0].whatHappened,initial.topics['topic-8'].whatHappened.trim());
  });
  await t.test('unresolved required content is bounded and never replaced with a Chinese template',async()=>{
   let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'{}'}}]});};
   assert.equal(await generateShareEn(report),undefined);assert.equal(calls,2);
  });
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
