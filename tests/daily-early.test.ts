import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,report,testDatabase} from './helpers/data-fixtures';

test('early daily generation preserves the target window and excludes future data before selecting samples',async()=>{
 const db=await testDatabase();
 const oldKey=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
 try {
  const {dailyGenerationPreview}=await import('../src/lib/admin-daily');
  const {generateDailyReport}=await import('../src/lib/daily-report');
  db.saveSnapshotToDb(snapshot('2099-11-13-00','2099-11-12T16:00:00Z')); // before target start: excluded
  db.saveSnapshotToDb(snapshot('2099-11-13-04','2099-11-12T20:00:00Z'));
  db.saveTopicAnalysisToDb('2099-11-13-04','topic-one',report('2099-11-13').topics[0].aiAnalysis!);
  for(let hour=5;hour<=23;hour++)db.saveSnapshotToDb(snapshot('2099-11-13-'+String(hour).padStart(2,'0'),'2099-11-13T15:00:00Z')); // all timestamped after execution
  const now=new Date('2099-11-13T12:00:00+08:00');
  const legacy={...report('2099-11-14'),windowStart:'2099-11-13-02',windowEnd:'2099-11-14-02'};
  db.saveDailyReportToDb(legacy);
  const preview=dailyGenerationPreview('2099-11-13',now);
  assert.equal(preview.snapshotCount,1);
  assert.equal(preview.complete,false);
  assert.equal(preview.windowStart,'2099-11-13-02');
  assert.equal(preview.reportDate,'2099-11-13');
  assert.equal(preview.windowEnd,'2099-11-14-02');
  const future=dailyGenerationPreview('2099-11-14',now);
  assert.equal(future.snapshotCount,0);
  assert.equal(future.hasTopics,false);
  assert.equal(future.windowStart,'2099-11-14-02');
  assert.equal(future.windowEnd,'2099-11-15-02');
  const {exportMonth}=await import('../src/lib/archive-export');
  const {registerArchives,closeArchives}=await import('../src/lib/archive-catalog');
  const pack=await exportMonth({start:'2099-11-13',end:'2099-11-13'},'full');
  await registerArchives([pack.path]);
  // A newer main version is timestamped after observedUntil: neither its payload nor analysis belongs in this report.
  db.saveSnapshotToDb(snapshot('2099-11-13-04','2099-11-13T15:00:00Z'));
  db.saveTopicAnalysisToDb('2099-11-13-04','topic-one',{...report('2099-11-13').topics[0].aiAnalysis!,model:'wrong-future-analysis'});
  const daily=await generateDailyReport(new Date('2099-11-14T02:00:00+08:00'),{requireData:true,observedUntil:now});
  assert.equal(daily.windowStart,'2099-11-13-02');
  assert.equal(daily.windowEnd,'2099-11-14-02');
  assert.equal(daily.collection?.sampleCount,1);
  assert.equal(daily.collection?.complete,false);
  assert.equal(daily.topics[0].sampleCount,1);
  assert.equal(daily.topics[0].aiAnalysis?.model,'test');
  assert.match(daily.overview,/提前生成/);
  assert.equal(daily.reportDate,'2099-11-13');
  assert.equal(db.readDailyReportFromDb('2099-11-13')?.collection?.complete,false);
  assert.deepEqual(db.readDailyReportFromDb('2099-11-14'),legacy);
  closeArchives();
 } finally {
  if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
  db.close();
 }
});
