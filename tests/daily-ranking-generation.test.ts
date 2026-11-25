import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';

test('an invalid-rank collection cannot replace an existing daily report or trigger paid generation',async()=>{
 const db=await testDatabase(),oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('Paid generation must not start');};
 try{
  const saved=report('2026-11-24');db.saveDailyReportToDb(saved);
  const sample=snapshot('2026-11-24-08','2026-11-24T00:00:00Z'),video=sample.topics[0];
  video.sources=['B 站热门'];video.categories=['video'];video.occurrences[0]={...video.occurrences[0],sourceId:'bilibili',sourceName:'B 站热门',sourceCategory:'video',rank:-1};
  sample.rawItems=video.occurrences;db.saveSnapshotToDb(sample);
  const {dailyGenerationPreview,requireDailyGenerationData}=await import('../src/lib/admin-daily');
  assert.equal(dailyGenerationPreview('2026-11-24',new Date('2026-11-25T03:00:00+08:00')).hasTopics,false);
  assert.throws(()=>requireDailyGenerationData('2026-11-24'),/话题/);
  const {generateDailyReport}=await import('../src/lib/daily-report');
  await assert.rejects(generateDailyReport(new Date('2026-11-25T02:00:00+08:00'),{observedUntil:new Date('2026-11-25T03:00:00+08:00')}),/综合日报/);
  assert.equal(calls,0);assert.deepEqual(db.readDailyReportFromDb(saved.reportDate),saved);
 }finally{globalThis.fetch=oldFetch;db.close();}
});
