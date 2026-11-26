import test from 'node:test';
import assert from 'node:assert/strict';
import {report,testDatabase,snapshot} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('public source pages freeze saved bilingual revisions, remain readable after edits, and exclude private draft data',async()=>{
 const ctx=await testDatabase();
 try{
  const service=await import('../src/lib/topic-sharing/service');
  const publications=await import('../src/lib/publications/store');
  const daily=report('2026-11-25');daily.topics[0].links=[{sourceId:'weibo',sourceName:'微博热搜',title:'原始话题',url:'https://s.weibo.com/weibo?q=test'}];ctx.saveDailyReportToDb(daily);
  const source=service.loadTopicShareSource({kind:'daily',date:daily.reportDate,topicId:'topic-one'}),copy=topicShareCopy(source);
  copy.en.posts[1].reason='PRIVATE_CANDIDATE_REASON';
  const record=service.persistTopicShare(source,copy,'none');
  assert.equal(publications.listPublications().length,0,'generation alone must not publish drafts');
  const prepared=publications.preparePublication({kind:'topic',id:record.id,expectedRevision:record.revision});
  const saved=publications.readPublication(prepared.id)!;assert.equal(saved.payload.kind,'topic');assert.equal(saved.payload.cards[0].links[0].kind,'search');
  assert.equal(saved.payload.posts.en,copy.en.posts.find(p=>p.id===copy.en.selectedPostId)!.text);
  assert.doesNotMatch(JSON.stringify(saved),/PRIVATE_CANDIDATE_REASON|reviewWarnings|sourceKey|sourceFingerprint|model|experiment-notes/);
  assert.equal(publications.preparePublication({kind:'topic',id:record.id,expectedRevision:record.revision}).id,prepared.id);
  const updated=service.saveTopicShareEdits(record.id,{...copy,en:{...copy.en,summary:'Changed after publication.'}},record.revision);
  assert.throws(()=>publications.preparePublication({kind:'topic',id:record.id,expectedRevision:record.revision}),/版本|更新/);
  const second=publications.preparePublication({kind:'topic',id:record.id,expectedRevision:updated.revision});assert.notEqual(second.id,prepared.id);
  assert.equal(publications.readPublication(prepared.id)!.payload.cards[0].en.summary,copy.en.summary);
  ctx.getDb().prepare('delete from daily_reports').run();ctx.getDb().prepare('delete from topic_shares').run();
  assert.ok(publications.readPublication(prepared.id),'publication is independent of source cleanup');
  assert.equal(publications.readPublication('../admin'),null);
  // Hourly-origin shares use the same publication contract.
  ctx.saveSnapshotToDb(snapshot('2026-11-25-12'));
  const {hourlyBrowse}=await import('../src/lib/admin-browse');const browse=hourlyBrowse({date:'2026-11-25'});
  const hourlySource=service.loadTopicShareSource({kind:'hourly',snapshot:browse.snapshot!.date,version:browse.snapshot!.version,key:browse.items[0].key});
  const hourly=service.persistTopicShare(hourlySource,topicShareCopy(hourlySource),'none');
  const hourlyPublication=publications.preparePublication({kind:'topic',id:hourly.id,expectedRevision:hourly.revision});assert.equal(publications.readPublication(hourlyPublication.id)!.payload.kind,'hourly');

  const {savedShareEnFixture}=await import('./helpers/shareen-fixture'),{sourceFingerprint,shareEnRevision}=await import('../src/lib/shareen');
  const ten=report('2026-11-26');ten.topics=Array.from({length:10},(_,index)=>({...structuredClone(ten.topics[0]),id:`story-${index+1}`,rank:index+1,title:`中文话题${index+1}`}));
  ten.shareEn=await savedShareEnFixture(ten);ctx.saveDailyReportToDb(ten);
  const stored=ctx.readDailyReportFromDb(ten.reportDate)!,request={kind:'daily' as const,date:ten.reportDate,expectedRevision:shareEnRevision(stored.shareEn),expectedSourceFingerprint:sourceFingerprint(stored)};
  const draft=structuredClone(stored.shareEn!);draft.highlights[0].whatHappened='A local publication draft with a concrete saved detail.';
  const dailyPage=publications.preparePublication({...request,copy:draft}),dailyPayload=publications.readPublication(dailyPage.id)!.payload;
  assert.equal(dailyPayload.cards.length,10);assert.equal(dailyPayload.cards.filter(card=>card.selected).length,3);assert.equal(dailyPayload.cards[0].en.summary,draft.highlights[0].whatHappened);
  assert.notEqual(ctx.readDailyReportFromDb(ten.reportDate)!.shareEn!.highlights[0].whatHappened,draft.highlights[0].whatHappened,'publishing a local daily edit must not silently save it as the report draft');
  assert.throws(()=>publications.preparePublication({...request,copy:{...draft,sourceFingerprint:'0'.repeat(64)}}),/来源版本/);
  stored.topics[0].oneLine=stored.topics[0].title;stored.topics[0].whyItMatters='';delete stored.topics[0].aiAnalysis;stored.shareEn!.sourceFingerprint=sourceFingerprint(stored);ctx.saveDailyReportToDb(stored);
  const legacyPage=publications.preparePublication({kind:'daily',date:stored.reportDate,expectedRevision:shareEnRevision(stored.shareEn),expectedSourceFingerprint:sourceFingerprint(stored)});
  assert.equal(publications.readPublication(legacyPage.id)!.payload.cards[0].zh.summary,'','a valid English legacy cache does not require invented native details');
  assert.equal(publications.readPublication(dailyPage.id)!.payload.cards[0].en.summary,draft.highlights[0].whatHappened,'regeneration cannot rewrite an older public page');
 }finally{ctx.close();}
});
