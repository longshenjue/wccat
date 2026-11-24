import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {testDatabase,report as fixture} from './helpers/data-fixtures';
import {shareEnDraft} from './helpers/shareen-fixture';

test('sharing caches, force regeneration, field-only guards and archive copy-on-write',async(t)=>{
 const ctx=await testDatabase();const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;
 // Credentials must not also be ordinary words used by the content assertions.
 process.env.DEEPSEEK_API_KEY='sharing-fixture-api-key-7f2c';
 try{
  const {generateSharing,saveShareEnEdits}=await import('../src/lib/sharing');
  const {saveSharingFields}=await import('../src/lib/shareen-persistence');
  const {shareEnRevision}=await import('../src/lib/shareen');
  const report=fixture('2026-09-15');
  report.topics=[...report.topics,{...report.topics[0],id:'topic-two',rank:2,title:'另一条新闻',aiAnalysis:undefined}];
  report.shareEnglish={...report.shareEnglish!,topics:[...report.shareEnglish!.topics,{id:'topic-two',title:'Another story',oneLine:'Summary',whyItMatters:'Background',sources:['Weibo']}]};
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify(shareEnDraft(report))}}]});};
  ctx.saveDailyReportToDb(report);
  const ready=await generateSharing(report.reportDate,{format:'shareen'});
  assert.equal(ready.shareEnReady,true);assert.equal(ready.englishReady,true);assert.equal(calls,1);
  const saved=ctx.readDailyReportFromDb(report.reportDate)!;assert.deepEqual(saved.shareEnglish,report.shareEnglish);
  assert.equal(saved.generatedAt,report.generatedAt);assert.equal(saved.wechatDraft,report.wechatDraft);
  assert.deepEqual((await generateSharing(report.reportDate,{format:'all'})).report,saved);assert.equal(calls,1);
  await t.test('failed force regeneration retains both saved usable sharing versions',async()=>{
   globalThis.fetch=async()=>{calls++;return new Response('',{status:503});};
   const result=await generateSharing(report.reportDate,{format:'all',force:true});
   assert.equal(result.englishReady,true);assert.equal(result.shareEnReady,true);assert.deepEqual(ctx.readDailyReportFromDb(report.reportDate),saved);assert.equal(calls,3);
  });
  await t.test('ShareEn writes preserve ordinary English updated while AI is running',async()=>{
   globalThis.fetch=async()=>{
    ctx.saveDailyShareEnglishToDb({...saved,shareEnglish:{...saved.shareEnglish!,headline:'Concurrent English'}});
    return Response.json({choices:[{message:{content:JSON.stringify(shareEnDraft(report))}}]});
   };
   const result=await generateSharing(report.reportDate,{format:'shareen',force:true});
   assert.equal(result.report.shareEnglish?.headline,'Concurrent English');assert.equal(result.report.headline,report.headline);
  });
  await t.test('new Chinese content with the same generatedAt still rejects stale output',async()=>{
   const newer={...saved,headline:'中文内容变更'};
   globalThis.fetch=async()=>{ctx.saveDailyReportToDb(newer);return Response.json({choices:[{message:{content:JSON.stringify(shareEnDraft(report))}}]});};
   await assert.rejects(generateSharing(report.reportDate,{format:'shareen',force:true}),/changed|stale/i);
   assert.deepEqual(ctx.readDailyReportFromDb(report.reportDate),newer);
   assert.equal(saveSharingFields(saved,{shareEn:saved.shareEn}),false);
   ctx.saveDailyReportToDb(saved);
  });
  await t.test('transactional target comparison rejects outdated English and ShareEn replacements',()=>{
   const baseline=ctx.readDailyReportFromDb(report.reportDate)!;
   const editedEnglish={...baseline.shareEnglish!,headline:'A newer English edit'};
   const editedShareEn={...baseline.shareEn!,overview:{...baseline.shareEn!.overview,headline:'A newer card edit'}};
   ctx.saveDailyReportToDb({...baseline,shareEnglish:editedEnglish,shareEn:editedShareEn});
   assert.equal(saveSharingFields(baseline,{shareEnglish:{...baseline.shareEnglish!,headline:'Delayed English'}}),false);
   assert.equal(saveSharingFields(baseline,{shareEn:{...baseline.shareEn!,overview:{...baseline.shareEn!.overview,headline:'Delayed card'}}}),false);
   assert.equal(ctx.readDailyReportFromDb(report.reportDate)?.shareEnglish?.headline,'A newer English edit');
   assert.equal(ctx.readDailyReportFromDb(report.reportDate)?.shareEn?.overview.headline,'A newer card edit');
   ctx.saveDailyReportToDb(baseline);
  });
  await t.test('maintenance generation rejects a delayed sharing write',()=>{
   const generation=ctx.writeGeneration();
   ctx.getDb().prepare('update maintenance_state set generation=generation+1 where id=1').run();
   assert.throws(()=>saveSharingFields(saved,{shareEn:saved.shareEn},generation),/版本已改变/);
  });
  await t.test('manual save validates fingerprints and performs no model calls',()=>{
   const copy=structuredClone(saved.shareEn!);copy.overview.headline='An edited daily headline';
   globalThis.fetch=async()=>{throw new Error('Manual saves do not call AI');};
   assert.equal(saveShareEnEdits(report.reportDate,copy,shareEnRevision(ctx.readDailyReportFromDb(report.reportDate)?.shareEn)).shareEn?.overview.headline,'An edited daily headline');
   assert.throws(()=>saveShareEnEdits(report.reportDate,{...copy,sourceFingerprint:'old'},shareEnRevision(ctx.readDailyReportFromDb(report.reportDate)?.shareEn)),/fingerprint/i);
  });
  await t.test('stale browser saves cannot overwrite same-source edits or regeneration',async()=>{
   const loaded=ctx.readDailyReportFromDb(report.reportDate)!;
   const loadedRevision=shareEnRevision(loaded.shareEn);
   const firstEdit={...loaded.shareEn!,overview:{...loaded.shareEn!.overview,headline:'Latest browser edit'}};
   saveShareEnEdits(report.reportDate,firstEdit,loadedRevision);
   assert.throws(()=>saveShareEnEdits(report.reportDate,loaded.shareEn!,loadedRevision),/changed.*reload/i);
   assert.equal(ctx.readDailyReportFromDb(report.reportDate)?.shareEn?.overview.headline,'Latest browser edit');
   const beforeRegeneration=ctx.readDailyReportFromDb(report.reportDate)!;
   const beforeRevision=shareEnRevision(beforeRegeneration.shareEn);
   globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({...shareEnDraft(report),overview:{...shareEnDraft(report).overview,headline:'A newly regenerated headline'}})}}]});
   const regenerated=(await generateSharing(report.reportDate,{format:'shareen',force:true})).report.shareEn!;
   assert.equal(regenerated.layout,'editorial');
   assert.notDeepEqual(regenerated,beforeRegeneration.shareEn);
   assert.throws(()=>saveShareEnEdits(report.reportDate,beforeRegeneration.shareEn!,beforeRevision),/changed.*reload/i);
   assert.deepEqual(ctx.readDailyReportFromDb(report.reportDate)?.shareEn,regenerated);
   assert.throws(()=>saveShareEnEdits(report.reportDate,beforeRegeneration.shareEn!,''),/changed.*reload/i);
  });
  await t.test('archive report can be edited into main without altering registered archive; copies survive roundtrip',async()=>{
   const {exportMonth}=await import('../src/lib/archive-export');
   const {registerArchives,archiveEntries,closeArchives}=await import('../src/lib/archive-catalog');
   const {archivesDir}=await import('../src/lib/storage-paths');
   const pack=await exportMonth({start:'2026-09-01',end:'2026-09-30'},'daily');await registerArchives([pack.path]);
   const file=join(archivesDir,archiveEntries()[0].file),before=readFileSync(file);
   const archived=ctx.readDailyReportFromDb(report.reportDate)!;
   ctx.getDb().prepare('delete from daily_reports where report_date=?').run(report.reportDate);
   assert.deepEqual(ctx.readDailyReportFromDb(report.reportDate),archived);
   const edited=structuredClone(archived.shareEn!);edited.overview.headline='Edited historical report';
   const restored=saveShareEnEdits(report.reportDate,edited,shareEnRevision(archived.shareEn));
   assert.equal(restored.generatedAt,report.generatedAt);assert.deepEqual(restored.shareEnglish,archived.shareEnglish);
   assert.equal(restored.shareEn?.overview.headline,'Edited historical report');assert.deepEqual(readFileSync(file),before);
   assert.equal((ctx.getDb().prepare('select count(*) as n from daily_reports where report_date=?').get(report.reportDate) as {n:number}).n,1);
   closeArchives();
  });
 }finally{ctx.close();globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
