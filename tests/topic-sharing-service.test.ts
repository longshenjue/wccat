import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('single-story sources retain exact versions and frozen drafts protect concurrent edits',async()=>{
 const ctx=await testDatabase();
 try{
  const service=await import('../src/lib/topic-sharing/service');
  const {hourlyBrowse,dailyBrowse}=await import('../src/lib/admin-browse');
  ctx.saveSnapshotToDb(snapshot('2026-11-24-10'));
  const browse=hourlyBrowse({date:'2026-11-24'}),ref={kind:'hourly' as const,snapshot:browse.snapshot!.date,version:browse.snapshot!.version,key:browse.items[0].key};
  const source=service.loadTopicShareSource(ref);
  assert.deepEqual(source.ref,ref,'a row identifier named key must round-trip as source metadata, not be redacted as an API key');
  assert.equal(source.title,'测试话题');assert.equal(source.links[0].url,'https://example.test/story');assert.equal(source.date,'2026-11-24');assert.match(source.fingerprint,/^[a-f0-9]{64}$/);
  assert.throws(()=>service.loadTopicShareSource({...ref,version:'changed'}),/版本/);
  assert.throws(()=>service.parseTopicShareRef({...ref,snapshot:'2026-11-24-99'}),/采样|时段/);
  const daily=report('2026-11-24');ctx.saveDailyReportToDb(daily);
  const d=dailyBrowse('2026-11-24'),dailyRef={kind:'daily' as const,date:'2026-11-24',topicId:'topic-one',version:d.version!.version};
  const dailySource=service.loadTopicShareSource(dailyRef);assert.equal(dailySource.detail,'完整分析');assert.equal(dailySource.ref.kind,'daily');
  assert.throws(()=>service.loadTopicShareSource({...dailyRef,topicId:'missing'}),/话题|条目/);
  assert.throws(()=>service.loadTopicShareSource({...dailyRef,version:'stale'}),/版本/);
  const copy=topicShareCopy(source);
  const record=service.persistTopicShare(source,copy,'none');assert.equal(record.copy.en.headline,copy.en.headline);
  assert.throws(()=>service.persistTopicShare(source,copy,'none'),/版本|更新/);
  const edited=service.saveTopicShareEdits(record.id,{...copy,en:{...copy.en,headline:'A revised local conversation'}},record.revision);
  const metadataEdit=service.saveTopicShareEdits(record.id,{...edited.copy,model:'forged-model',generatedAt:'1900-01-01T00:00:00Z'},edited.revision);
  assert.equal(metadataEdit.copy.model,'test');assert.equal(metadataEdit.copy.generatedAt,copy.generatedAt);
  assert.notEqual(edited.revision,record.revision);assert.throws(()=>service.saveTopicShareEdits(record.id,copy,record.revision),/版本|更新/);
  ctx.getDb().prepare('delete from snapshots').run();
  assert.equal(service.readTopicShare(record.id)?.copy.en.headline,'A revised local conversation','frozen draft survives removal of hourly data');
  const {reloadTopicShareData}=await import('../src/lib/topic-sharing/client-state');
  const {recommendTopic}=await import('../src/lib/topic-sharing/recommendation');
  const frozen=service.readTopicShare(record.id)!;
  const frozenPayload={source:frozen.source,recommendation:recommendTopic(frozen.source),record:frozen};
  const reloaded=await reloadTopicShareData(undefined,{live:async()=>service.topicSharePayload(ref),frozen:async()=>frozenPayload});
  assert.equal(reloaded.record!.revision,frozen.revision,'a real deleted hourly source returns 409; its latest frozen draft must still reload');
  assert.equal(ctx.readDailyReportFromDb('2026-11-24')?.headline,'日报','sharing never rewrites the original report');
 }finally{ctx.close();}
});
