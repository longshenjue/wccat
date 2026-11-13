import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';

test('registered archives deduplicate, span months and preserve newer main reports',async()=>{
 const ctx=await testDatabase();
 try{
  const {exportMonth}=await import('../src/lib/archive-export');
  const {registerArchives,archiveEntries,closeArchives}=await import('../src/lib/archive-catalog');
  ctx.saveSnapshotToDb(snapshot('2026-09-30-23','2026-09-30T15:00:00Z'));
  ctx.saveSnapshotToDb(snapshot('2026-10-01-00','2026-09-30T16:00:00Z'));
  const old=report('2026-09-30');ctx.saveDailyReportToDb(old);
  const full=await exportMonth({start:'2026-09-01',end:'2026-09-30'},'full');
  assert.equal((await registerArchives([full.path]))[0].duplicate,false);
  assert.equal((await registerArchives([full.path]))[0].duplicate,true);
  ctx.getDb().prepare("delete from snapshots where date < '2026-10'").run();
  ctx.getDb().prepare("delete from daily_reports where report_date='2026-09-30'").run();
  assert.equal(ctx.readSnapshotFromDb('2026-09-30-23')?.date,'2026-09-30-23');
  assert.deepEqual(ctx.readRecentSnapshotsFromDb(2,'2026-10-01-00').map(x=>x.date),['2026-09-30-23','2026-10-01-00']);
  assert.equal(ctx.readDailyReportFromDb('2026-09-30')?.wechatDraft,old.wechatDraft);
  const newer={...old,generatedAt:'2026-11-13T00:00:00Z',shareEnglish:{...old.shareEnglish!,headline:'New English',overview:'New overview'}};
  ctx.saveDailyReportToDb(newer);
  assert.deepEqual(ctx.readDailyReportFromDb('2026-09-30'),newer);
  for(let month=1;month<=12;month++){
   const day='2025-'+String(month).padStart(2,'0')+'-01';
   ctx.saveDailyReportToDb(report(day));
   const pack=await exportMonth({start:day,end:day},'daily');
   await registerArchives([pack.path]);
  }
  assert.equal(archiveEntries().length,13);
  assert.equal(ctx.listDailyReportDatesFromDb().length,13);
  const invalid=join(ctx.dir,'invalid.sqlite');writeFileSync(invalid,'not a database');
  await assert.rejects(registerArchives([invalid]));
  assert.equal(archiveEntries().length,13);
  closeArchives();
 }finally{ctx.close();}
});
