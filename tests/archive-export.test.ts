import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';

test('monthly date exports are portable, consistent and never mutate business records',async()=>{
 const ctx=await testDatabase();
 try{
  const {parseRange,splitMonths}=await import('../src/lib/data-range');
  const {previewCleanup}=await import('../src/lib/data-preview');
  const {exportMonth}=await import('../src/lib/archive-export');
  const {validateArchive}=await import('../src/lib/archive-format');
  for(const month of ['09','10','11']){ctx.saveSnapshotToDb(snapshot('2026-'+month+'-01-08'));ctx.saveDailyReportToDb(report('2026-'+month+'-01'));}
  const before=ctx.getDb().prepare('select * from snapshots order by date').all();
  assert.throws(()=>parseRange({start:'2026-02-30',end:'2026-03-01'}));
  assert.deepEqual(splitMonths(parseRange({start:'2026-09-20',end:'2026-11-04'})).map(x=>[x.start,x.end]),[['2026-09-20','2026-09-30'],['2026-10-01','2026-10-31'],['2026-11-01','2026-11-04']]);
  const range=parseRange({start:'2026-09-01',end:'2026-09-30'});
  const preview=previewCleanup(ctx.getDb(),range,Date.parse('2026-11-13T00:00:00Z'));
  assert.equal(preview.counts.snapshots,1);
  assert.equal(preview.dailyKept,3);
  const full=await exportMonth(range,'full',()=>{},()=>false);
  assert.equal(full.meta.counts.snapshots,1);
  assert.equal(full.meta.counts.daily_reports,1);
  assert.equal(full.meta.counts.topics,1);
  const file=gunzipSync(readFileSync(full.path));
  assert.equal(file.subarray(0,16).toString(),'SQLite format 3\0');
  assert.equal(full.sha256.length,64);
  const daily=await exportMonth(range,'daily',()=>{},()=>false);
  assert.equal(daily.meta.counts.snapshots,0);
  assert.equal(daily.meta.counts.daily_reports,1);
  assert.equal(validateArchive(full.sqlitePath).id,full.meta.id);
  await assert.rejects(exportMonth(range,'full',()=>{},()=>true),/取消/);
  assert.deepEqual(ctx.getDb().prepare('select * from snapshots order by date').all(),before);
 }finally{ctx.close();}
});

