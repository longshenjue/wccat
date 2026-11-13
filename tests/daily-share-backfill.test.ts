import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WccatDailyReport } from '../src/lib/daily-report';

test('backfills only English, skips valid cached copy, and refuses stale writes', async (t)=>{
 const previousDirectory=process.cwd();
 const directory=mkdtempSync(join(tmpdir(),'wccat-backfill-'));
 const previousFetch=globalThis.fetch;
 const previousKey=process.env.DEEPSEEK_API_KEY;
 process.chdir(directory);
 const {getDb,saveDailyReportToDb,readDailyReportFromDb}=await import('../src/lib/db');
 try {
  const {backfillDailyShareEnglish}=await import('../src/lib/daily-share-backfill');
  const report: WccatDailyReport={
   reportDate:'2026-11-13',generatedAt:'2026-11-13T00:10:00Z',windowStart:'2026-11-12-08',windowEnd:'2026-11-13-08',
   headline:'日报',overview:'总览',wechatDraft:'中文稿',videoScript:'视频稿',model:'test',
   topics:[{id:'topic-one',rank:1,title:'第四季 02',oneLine:'摘要',whyItMatters:'背景',sources:['微博'],dailyScore:10,peakRank:1,peakHeatScore:10,activeHours:1,categories:[],sentiment:'neutral',signal:'rising',links:[]}]
  };
  const english={headline:'Daily',overview:'Overview',topics:[{id:'topic-one',title:'Season 4 Episode 02',oneLine:'Summary',whyItMatters:'Context',sources:['Weibo']}]};
  let requests=0;
  process.env.DEEPSEEK_API_KEY='test-key';
  globalThis.fetch=async()=>{
   requests++;
   return Response.json({choices:[{message:{content:JSON.stringify(english)}}]});
  };
  saveDailyReportToDb(report);

  await t.test('saves the translation without changing report generation or Chinese copy',async()=>{
   assert.deepEqual(await backfillDailyShareEnglish(report.reportDate),{reportDate:report.reportDate,status:'generated'});
   assert.deepEqual(readDailyReportFromDb(report.reportDate),{...report,shareEnglish:english});
   assert.equal(requests,1);
  });
  await t.test('repeated runs reuse valid English without another API call',async()=>{
   assert.deepEqual(await backfillDailyShareEnglish(),{reportDate:report.reportDate,status:'cached'});
   assert.equal(requests,1);
  });
  await t.test('a newer report published during translation remains intact',async()=>{
   saveDailyReportToDb(report);
   const newer={...report,generatedAt:'2026-11-13T01:10:00Z',headline:'更新日报'};
   globalThis.fetch=async()=>{
    saveDailyReportToDb(newer);
    return Response.json({choices:[{message:{content:JSON.stringify(english)}}]});
   };
   await assert.rejects(backfillDailyShareEnglish(report.reportDate),/changed during translation/i);
   assert.deepEqual(readDailyReportFromDb(report.reportDate),newer);
  });
  await t.test('reports a missing runtime key instead of claiming success',async()=>{
   delete process.env.DEEPSEEK_API_KEY;
   await assert.rejects(backfillDailyShareEnglish(report.reportDate),/DEEPSEEK_API_KEY/);
   assert.equal(readDailyReportFromDb(report.reportDate)?.shareEnglish,undefined);
  });
  await t.test('missing dates do not create empty reports',async()=>{
   await assert.rejects(backfillDailyShareEnglish('2020-01-01'),/not found/i);
   assert.equal(readDailyReportFromDb('2020-01-01'),null);
  });
 } finally {
  getDb().close();
  globalThis.fetch=previousFetch;
  if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY=previousKey;
  process.chdir(previousDirectory);
  rmSync(directory,{recursive:true,force:true});
 }
});
