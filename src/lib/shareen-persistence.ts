import {getDb,readDailyReportFromDb} from './db';
import {guardedWrite} from './maintenance';
import {sourceFingerprint} from './shareen';
import type {WccatDailyReport} from './daily-report';

type SharingFields=Partial<Pick<WccatDailyReport,'shareEnglish'|'shareEn'>>;
/** Merge sharing fields into the CURRENT winner. Registered archive files stay read-only.
 * The source check and copy-on-write happen within the same main write transaction. */
export function saveSharingFields(source:WccatDailyReport,fields:SharingFields,expectedGeneration?:number):boolean {
 const database=getDb();
 return guardedWrite(database,()=>{
  const current=readDailyReportFromDb(source.reportDate);
  if(!current||sourceFingerprint(current)!==sourceFingerprint(source))return false;
  const updates=Object.fromEntries(Object.entries(fields).filter(([key,value])=>(key==='shareEnglish'||key==='shareEn')&&value!==undefined));
  // Compare the target cache in this transaction as well as the Chinese source.
  // Independent sharing fields still merge; delayed regeneration cannot erase an edit.
  for(const key of Object.keys(updates) as Array<keyof SharingFields>){
   if(JSON.stringify(current[key])!==JSON.stringify(source[key]))return false;
  }
  if(!Object.keys(updates).length)return true;
  const merged={...current,...updates};
  database.prepare(`insert into daily_reports(report_date,generated_at,model,payload)
   values(@reportDate,@generatedAt,@model,@payload)
   on conflict(report_date) do update set generated_at=excluded.generated_at,model=excluded.model,payload=excluded.payload`)
   .run({reportDate:current.reportDate,generatedAt:current.generatedAt,model:current.model,payload:JSON.stringify(merged)});
  return true;
 },expectedGeneration);
}
