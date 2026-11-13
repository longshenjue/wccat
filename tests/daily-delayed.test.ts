import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,testDatabase} from './helpers/data-fixtures';
test('actual collection time includes delayed samples whose hour keys precede the report boundary',async()=>{
 const db=await testDatabase();
 try {
  const {readDailyReportInput}=await import('../src/lib/daily-report-input');
  db.saveSnapshotToDb(snapshot('2025-09-02-01','2025-09-01T18:01:00Z'));
  db.saveSnapshotToDb(snapshot('2025-08-31-20','2025-09-01T20:00:00Z'));
  const input=readDailyReportInput(new Date('2025-09-03T02:00:00+08:00'),new Date('2025-09-02T10:00:00+08:00'));
  assert.equal(input.snapshots.length,2);
  assert.equal(input.snapshots[0].date,'2025-09-02-01');
  assert.equal(input.collection.complete,false);
 } finally {db.close();}
});
