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
  // A supported old database appended stats_payload after fetched_at.
  const rawSql=(ctx.getDb().prepare("select sql from sqlite_master where name='raw_items'").get() as {sql:string}).sql;
  ctx.getDb().exec('drop table raw_items');
  ctx.getDb().exec(rawSql.replace(/stats_payload text,\s*/i,''));
  ctx.getDb().exec('alter table raw_items add column stats_payload text');
  for(const month of ['09','10','11']){const item=snapshot('2026-'+month+'-01-08');item.rawItems[0].stats={views:123};ctx.saveSnapshotToDb(item);ctx.saveDailyReportToDb(report('2026-'+month+'-01'));}
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
  const {registerArchives,archiveSources,closeArchives}=await import('../src/lib/archive-catalog');
  try{
   await registerArchives([full.path]);
   ctx.getDb().prepare("delete from snapshots where date='2026-09-01-08'").run();
   assert.equal(ctx.readSnapshotFromDb('2026-09-01-08')?.rawItems[0].stats?.views,123);
   const source=[...archiveSources()][0];
   const restored=source.prepare('select stats_payload,fetched_at from raw_items').get() as {stats_payload:string;fetched_at:string};
   assert.deepEqual(JSON.parse(restored.stats_payload),{views:123});
   assert.equal(restored.fetched_at,'2026-09-01T00:00:00Z');
  }finally{closeArchives();}
 }finally{ctx.close();}
});

