import {readDailyReportFromDb,writeGeneration} from './db';
import type {GenerationLog,WccatDailyReport} from './daily-report';
import {getDailyShareCopy} from './daily-share-copy';
import {translateDailyShare} from './daily-share-translation';
import {generateShareEn,getValidShareEn,shareEnRevision,sourceFingerprint,validateShareEn} from './shareen';
import {saveSharingFields} from './shareen-persistence';
import type {ShareEnCopy,SharingFormat} from './shareen-types';

function englishReady(report:WccatDailyReport){try{getDailyShareCopy(report,'en');return true;}catch{return false;}}
function requireReport(reportDate:string){
 const report=readDailyReportFromDb(reportDate);
 if(!report)throw new Error(`Daily report not found: ${reportDate}`);
 return report;
}
/** Authenticated admin jobs and CLI only; reads/cached exports never invoke this service. */
export async function generateSharing(reportDate:string,options:{format?:SharingFormat;force?:boolean;log?:GenerationLog}={}):Promise<{report:WccatDailyReport;englishReady:boolean;shareEnReady:boolean}>{
 const format=options.format??'all';
 if(!['all','english','shareen'].includes(format))throw new Error('Unsupported sharing format');
 const generation=writeGeneration();
 let report=requireReport(reportDate);
 const fingerprint=sourceFingerprint(report);
 if(format==='all'||format==='english'){
  if(options.force||!englishReady(report)){
   options.log?.('info',`正在生成 ${reportDate} English`);
   const baseline=report;
   const shareEnglish=await translateDailyShare(report,options.log);
   const current=requireReport(reportDate);
   if(sourceFingerprint(current)!==fingerprint)throw new Error('Daily report changed during sharing generation; retry with the latest source.');
   // Another writer may have produced an English revision while this AI request ran.
   // Keep that newer copy instead of overwriting it with an older in-flight result.
   if(shareEnglish&&JSON.stringify(current.shareEnglish)===JSON.stringify(baseline.shareEnglish)){
    if(!saveSharingFields(baseline,{shareEnglish},generation))throw new Error('Daily report changed during English generation.');
   }else if(shareEnglish)options.log?.('warn','English 在生成期间已更新，保留最新版本');
   else options.log?.('warn','English 未生成，保留已有版本');
   report=requireReport(reportDate);
  }
 }
 if(format==='all'||format==='shareen'){
  if(options.force||!getValidShareEn(report)){
   options.log?.('info',`正在生成 ${reportDate} ShareEn`);
   const baseline=report;
   const shareEn=await generateShareEn(options.force?{...report,shareEn:undefined}:report,options.log);
   const current=requireReport(reportDate);
   if(sourceFingerprint(current)!==fingerprint)throw new Error('Daily report changed during ShareEn generation; retry with the latest source.');
   if(shareEn&&JSON.stringify(current.shareEn)===JSON.stringify(baseline.shareEn)){
    if(!saveSharingFields(baseline,{shareEn},generation))throw new Error('Daily report changed during ShareEn generation.');
    options.log?.('info','ShareEn 文案已保存；配图加载与图片排版将在预览/导出时检查');
   }else if(shareEn)options.log?.('warn','ShareEn 在生成期间已更新，保留最新版本');
   else options.log?.('warn','ShareEn 未生成，保留已有版本');
   report=requireReport(reportDate);
  }
 }
 return {report,englishReady:englishReady(report),shareEnReady:!!getValidShareEn(report)};
}

export {shareEnRevision} from './shareen';

export function saveShareEnEdits(reportDate:string,copy:ShareEnCopy,expectedRevision:string):WccatDailyReport {
 const generation=writeGeneration(),report=requireReport(reportDate);
 if(typeof expectedRevision!=='string'||expectedRevision!==shareEnRevision(report.shareEn))throw new Error('ShareEn changed since this editor was loaded; reload before saving.');
 const validated=validateShareEn(copy,report);
 if(!saveSharingFields(report,{shareEn:validated},generation))throw new Error('Daily report changed while saving ShareEn edits.');
 return requireReport(reportDate);
}
