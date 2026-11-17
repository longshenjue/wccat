import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {shareEnDraft,savedShareEnFixture} from './helpers/shareen-fixture';
import {readShareEnDraft,completeShareEnDraft} from '../src/lib/shareen-draft';
import {sourceFingerprint,validateShareEn,generateShareEn} from '../src/lib/shareen';
import {updateShareEnTop3} from '../src/lib/client-share-draft';

const report=fixture('2026-11-16');
report.topics=Array.from({length:10},(_,i)=>({...structuredClone(report.topics[0]),id:`story-${i+1}`,rank:i+1}));

for(const ranks of [[1,5,10],[5,1]])test(`new captions follow selected focus order ${ranks.join('/')}`,()=>{
 const draft=shareEnDraft(report);
 draft.highlights=ranks.map(rank=>({...draft.highlights[0],topicId:`story-${rank}`}));
 const assembled=completeShareEnDraft(readShareEnDraft(draft,report),report);
 assert.deepEqual(assembled.top3.map(t=>t.topicId),ranks.map(rank=>`story-${rank}`));
 const copy={...assembled,version:1 as const,generatedAt:report.generatedAt,model:'fixture',sourceFingerprint:sourceFingerprint(report)};
 assert.equal(validateShareEn(copy,report).captionBasis,'highlights');
 for(const post of copy.posts){
  copy.top3.forEach((t,i)=>assert.ok(post.text.includes(`${['1️⃣','2️⃣','3️⃣'][i]} ${t.summary}`)));
  assert.equal(post.text.split('\n').filter(line=>/^[1-3]️⃣ /u.test(line)).length,ranks.length);
 }
 const edited=updateShareEnTop3(copy,1,'An edited selected story');
 assert.deepEqual(edited.top3.map(t=>t.topicId),ranks.map(rank=>`story-${rank}`));
 assert.ok(edited.posts.every(p=>p.text.includes('2️⃣ An edited selected story')));
 assert.throws(()=>validateShareEn({...copy,top3:[...copy.top3].reverse()},report),/identity|order/i);
  for(const extra of ['  3️⃣ An unrelated old story','4️⃣ Another old story','4⃣No separator','🔟 A tenth old story']){
   const dirty={...copy,posts:copy.posts.map(p=>({...p,text:p.text+'\n'+extra+'\nWcCAT: read the cards.'}))};
   assert.throws(()=>validateShareEn(dirty,report),/caption|Top3/i);
   const repaired=updateShareEnTop3(dirty,1,'The selected second story');
   assert.ok(validateShareEn(repaired,report));
   assert.ok(repaired.posts.every(p=>!p.text.includes('old story')&&!p.text.includes('No separator')));
  }
});

test('a reserved-list model hook and multiline summary cannot discard good cards or candidates',async()=>{
 const raw=shareEnDraft(report);
 raw.posts=[{id:'bad',template:'story_led',text:'1️⃣ A numbered model hook.',reason:'A hook'},{id:'good',template:'daily_digest',text:'Keep this good selected hook.',reason:'A hook'}];raw.selectedPostId='good';
 raw.top3[0].summary='First line\ncontinued';raw.overview.topics[1].title='Second\nheadline';
 raw.top3=raw.top3.filter(t=>t.topicId!=='story-2');
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(raw)}}]});};
 try{
  const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,1);
  assert.equal(copy.selectedPostId,'good');assert.ok(copy.posts.some(p=>p.text.includes('Keep this good selected hook.')));
  assert.ok(copy.highlights.every(h=>h.battle));
  assert.equal(copy.top3[0].summary,'First line continued');assert.equal(copy.top3[1].summary,'Second headline');
  assert.equal(copy.overview.topics[1].title,'Second\nheadline');assert.ok(validateShareEn(copy,report));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});

test('legacy original-rank captions remain readable but cannot claim focus alignment',async()=>{
 const legacy=await savedShareEnFixture(report);
 legacy.highlights=[legacy.highlights[0],{...legacy.highlights[1],topicId:'story-5'},{...legacy.highlights[2],topicId:'story-10'}];
 assert.deepEqual(validateShareEn(legacy,report).top3.map(t=>t.topicId),['story-1','story-2','story-3']);
 assert.throws(()=>validateShareEn({...legacy,captionBasis:'highlights'},report),/identity|order/i);
 assert.throws(()=>validateShareEn({...legacy,captionBasis:'unknown'},report),/caption/i);
});
