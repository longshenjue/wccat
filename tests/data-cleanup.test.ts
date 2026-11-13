import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';
test('cleanup preserves daily content, recent hours, unrelated months and physically shrinks the database',async(t)=>{
 const ctx=await testDatabase();
 try{
  const {previewCleanup}=await import('../src/lib/data-preview');
  const {cleanupData,storageUsage}=await import('../src/lib/data-cleanup');
  const {requireDisk}=await import('../src/lib/archive-format');
  const {getDailyShareCopy}=await import('../src/lib/daily-share-copy');
  const now=Date.now(), old='2025-09-01';
  for(let hour=0;hour<12;hour++){
   const item=snapshot(old+'-'+String(hour).padStart(2,'0'));item.digest.overview='archive-test '.repeat(30000);ctx.saveSnapshotToDb(item);
  }
  ctx.saveSnapshotToDb(snapshot('2025-10-01-08'));
  ctx.saveSnapshotToDb(snapshot('2026-11-13-23',new Date(now-3600000).toISOString()));
  ctx.saveDailyReportToDb(report(old));
  const beforeReport=ctx.readDailyReportFromDb(old);
  const range={start:old,end:'2025-09-30'};
  const stale=previewCleanup(ctx.getDb(),range,now);
  ctx.saveDailyReportToDb({...beforeReport!,headline:'更新日报'});
  await assert.rejects(cleanupData(stale,()=>{},()=>false),/版本/);
  assert.equal((ctx.getDb().prepare("select count(*) as n from snapshots where date like '2025-09%'").get() as {n:number}).n,12);
  assert.throws(()=>requireDisk(Number.MAX_SAFE_INTEGER),/空间/);
  const preview=previewCleanup(ctx.getDb(),range,now);
  await t.test('insufficient preparation space does not delete any source row',async()=>{
   ctx.getDb().pragma('auto_vacuum=NONE');ctx.getDb().exec('VACUUM');
   const fs=require('node:fs');
   const original=fs.statfsSync(ctx.dir);
   const replacement=t.mock.method(fs,'statfsSync',()=>({...original,bavail:0}));
   try{await assert.rejects(cleanupData(preview),/空间/);}
   finally{replacement.mock.restore();}
   assert.equal((ctx.getDb().prepare('select count(*) as n from snapshots').get() as {n:number}).n,14);
   assert.deepEqual(ctx.readDailyReportFromDb(old),{...beforeReport!,headline:'更新日报'});
  });
  ctx.getDb().pragma('wal_checkpoint(TRUNCATE)');
  const before=storageUsage().databaseBytes;
  const daily=ctx.readDailyReportFromDb(old);
  const result=await cleanupData(preview,()=>{},()=>false);
  assert.equal(result.deleted.snapshots,12);
  assert.equal(result.logicalDeleted,true);
  assert.equal(result.reclaimed,true);
  assert.ok(storageUsage().databaseBytes<before,'physical database shrinks');
  assert.deepEqual(ctx.readDailyReportFromDb(old),daily);
  assert.ok(getDailyShareCopy(ctx.readDailyReportFromDb(old)!,'zh').analysis);
  assert.ok(getDailyShareCopy(ctx.readDailyReportFromDb(old)!,'en').analysis);
  assert.equal(ctx.readSnapshotFromDb('2025-09-01-00'),null);
  assert.ok(ctx.readSnapshotFromDb('2025-10-01-08'));
  const recent=previewCleanup(ctx.getDb(),{start:'2026-11-13',end:'2026-11-13'},now);
  assert.equal(recent.counts.snapshots,0);
  assert.equal(recent.protected,1);
  assert.equal((ctx.getDb().prepare('select count(*) as n from cleared_hours').get() as {n:number}).n,12);
  await t.test('cancelled cleanup leaves all remaining records unchanged',async()=>{
   const oldPreview=previewCleanup(ctx.getDb(),{start:'2025-10-01',end:'2025-10-31'});
   await assert.rejects(cleanupData(oldPreview,()=>{},()=>true),/取消/);
   assert.ok(ctx.readSnapshotFromDb('2025-10-01-08'));
  });
 }finally{ctx.close();}
});

