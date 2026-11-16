import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSharingDraft, type SharingDraft } from '../src/lib/client-share-draft';
import type { WccatDailyReport } from '../src/lib/daily-report';
import type { ShareEnCopy } from '../src/lib/shareen-types';

const savedCopy = {selectedPostId:'one',posts:[{id:'one',text:'WcCAT Daily Hot\nOriginal top three'}]} as ShareEnCopy;
const original = {reportDate:'2026-11-15',generatedAt:'2026-11-16T02:00:00Z',headline:'Original headline',shareEn:savedCopy} as WccatDailyReport;
const editedCopy = {...savedCopy,posts:[{...savedCopy.posts[0],text:'WcCAT Daily Hot\nLocal edited top three'}]};
const draft:SharingDraft={date:original.reportDate,copy:editedCopy,baseReport:original,dirty:true,conflict:false,expectedRevision:'saved-version'};

test('background refresh preserves an unsaved draft and its matching source report',()=>{
 const incoming=structuredClone(original);
 const next=reconcileSharingDraft(draft,original.reportDate,incoming,'saved-version');
 assert.equal(next.copy,editedCopy);
 assert.equal(next.expectedRevision,'saved-version');
 assert.equal(next.baseReport,original);
 assert.equal(next.dirty,true);
 assert.equal(next.conflict,false);
});

test('server caption or source changes mark conflict while retaining local edits',()=>{
 for(const incoming of [{...original,shareEn:{...savedCopy,selectedPostId:'two'}},{...original,headline:'Regenerated headline, same timestamp'}]) {
  const next=reconcileSharingDraft(draft,original.reportDate,incoming,'new-server-version');
  assert.equal(next.copy,editedCopy);
  assert.equal(next.expectedRevision,'saved-version');
  assert.equal(next.baseReport,original);
  assert.equal(next.conflict,true);
 }
});

test('ordinary English updates do not conflict with a ShareEn draft',()=>{
 const next=reconcileSharingDraft(draft,original.reportDate,{...original,shareEnglish:{headline:'New English'} as WccatDailyReport['shareEnglish']},'saved-version');
 assert.equal(next.conflict,false);
 assert.equal(next.copy,editedCopy);
 assert.equal(next.expectedRevision,'saved-version');
});

test('a chosen different date or a saved draft loads the new server version',()=>{
 const incoming={...original,reportDate:'2026-11-14'};
 const next=reconcileSharingDraft(draft,incoming.reportDate,incoming,'latest-version');
 assert.equal(next.copy,savedCopy);
 assert.equal(next.expectedRevision,'latest-version');
 assert.equal(next.baseReport,incoming);
 assert.equal(next.dirty,false);
 assert.equal(next.conflict,false);
 assert.equal(reconcileSharingDraft({...draft,dirty:false},original.reportDate,original,'latest-version').copy,savedCopy);
});

test('editing original Top3 summaries updates every candidate without changing source identities or selected hook',async()=>{
 const {updateShareEnTop3}=await import('../src/lib/client-share-draft');
 const top3=[{topicId:'rank-one',summary:'First summary'},{topicId:'rank-two',summary:'Second summary'},{topicId:'rank-three',summary:'Third summary'}];
 const copy={top3,selectedPostId:'two',posts:['one','two'].map(id=>({id,template:'daily_digest',reason:'reason',text:`WcCAT Daily Hot\n\nHook ${id}.\n\n1️⃣ First summary\n2️⃣ Second summary\n3️⃣ Third summary\n\nWcCAT: read the cards.`}))} as ShareEnCopy;
 const next=updateShareEnTop3(copy,1,'An edited original second story');
 assert.deepEqual(next.top3.map(topic=>topic.topicId),['rank-one','rank-two','rank-three']);
 assert.equal(next.top3[1].summary,'An edited original second story');
 assert.equal(next.selectedPostId,'two');
 for(const post of next.posts){
  assert.match(post.text,/^WcCAT Daily Hot\n/);
  assert.match(post.text,/1️⃣ First summary\n2️⃣ An edited original second story\n3️⃣ Third summary/);
  assert.ok(post.text.includes(`Hook ${post.id}.`));
  assert.ok(post.text.endsWith('WcCAT: read the cards.'));
  assert.ok(!post.text.includes('2️⃣ Second summary'));
 }
 assert.equal(copy.top3[1].summary,'Second summary','editing does not mutate the saved cache');
});
