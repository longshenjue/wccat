import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WccatDailyReport } from '../src/lib/daily-report';

test('a delayed English translation cannot overwrite a newer report generation', async()=>{
 const originalDirectory=process.cwd();
 const directory=mkdtempSync(join(tmpdir(),'wccat-share-db-'));
 process.chdir(directory);
 const {getDb,saveDailyReportToDb,saveDailyShareEnglishToDb,readDailyReportFromDb}=await import('../src/lib/db');
 try {
  const old: WccatDailyReport={reportDate:'2026-11-12',generatedAt:'2026-11-12T06:00:00Z',windowStart:'2026-11-12-14',windowEnd:'2026-11-12-14',headline:'Old',overview:'Old overview',topics:[],wechatDraft:'',videoScript:'',model:'test',shareEnglish:{headline:'Old English',overview:'',topics:[]}};
  const newer={...old,generatedAt:'2026-11-12T07:00:00Z',headline:'New',overview:'New overview',shareEnglish:{headline:'New English',overview:'',topics:[]}};
  saveDailyReportToDb(old);
  saveDailyReportToDb(newer);
  saveDailyShareEnglishToDb(old);
  assert.deepEqual(readDailyReportFromDb('2026-11-12'),newer);
  const translated={...newer,shareEnglish:{headline:'Latest English',overview:'',topics:[]}};
  saveDailyShareEnglishToDb(translated);
  assert.deepEqual(readDailyReportFromDb('2026-11-12'),translated);
 } finally {
  getDb().close();
  process.chdir(originalDirectory);
  rmSync(directory,{recursive:true,force:true});
 }
});
