import {readDailyReportFromDb,writeGeneration} from './db';
import type {GenerationLog,WccatDailyReport} from './daily-report';
import {getDailyShareCopy} from './daily-share-copy';
import {translateDailyShare} from './daily-share-translation';
import {generateShareEn,getValidShareEn,shareEnRevision,sourceFingerprint,validateShareEn} from './shareen';
import {saveSharingFields} from './shareen-persistence';
import {prepareShareEnImages} from './shareen-images';
import {restoreImageAssets,restoreGeneratedImages} from './shareen-image-state';
import type {ShareEnCopy,SharingFormat} from './shareen-types';

function englishReady(report:WccatDailyReport){try{getDailyShareCopy(report,'en');return true;}catch{return false;}}
function requireReport(reportDate:string){
 const report=readDailyReportFromDb(reportDate);
 if(!report)throw new Error(`Daily report not found: ${reportDate}`);
 return report;
}
export function validateSharingTopic(report:WccatDailyReport,format:SharingFormat,topicId:unknown):asserts topicId is string|undefined {
 if(topicId!==undefined&&(format!=='images'||typeof topicId!=='string'||!getValidShareEn(report)?.highlights.some(item=>item.topicId===topicId))){
  throw new Error('请选择该日期 ShareEn 稿件中的焦点配图。');
 }
}

/** The text is committed before optional image work starts. Compare against that exact saved revision. */
export async function savePreparedShareEnImages(report:WccatDailyReport,copy:ShareEnCopy,generation:number,options:Parameters<typeof prepareShareEnImages>[2]){
 const prepared=await prepareShareEnImages(report,copy,options);
 const changed='Daily report or ShareEn changed during image processing; reload before retrying.';
 if(prepared===copy){
  // A cache hit or failed refresh can finish after an edit. Skip copy-on-write for an unchanged archive.
  const current=requireReport(report.reportDate);
  if(writeGeneration()!==generation||sourceFingerprint(current)!==sourceFingerprint(report)||shareEnRevision(current.shareEn)!==shareEnRevision(report.shareEn))throw new Error(changed);
  return current;
 }
 if(!saveSharingFields(report,{shareEn:prepared},generation))throw new Error(changed);
 return requireReport(report.reportDate);
}

/** Authenticated admin jobs and CLI only; reads/cached exports never invoke this service. */
export async function generateSharing(reportDate:string,options:{format?:SharingFormat;force?:boolean;topicId?:string;log?:GenerationLog}={}):Promise<{report:WccatDailyReport;englishReady:boolean;shareEnReady:boolean}>{
 const format=options.format??'all';
 if(!['all','english','shareen','images'].includes(format))throw new Error('Unsupported sharing format');
 const generation=writeGeneration();
 let report=requireReport(reportDate);
 validateSharingTopic(report,format,options.topicId);
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
   report=current;
   if(shareEn&&JSON.stringify(current.shareEn)===JSON.stringify(baseline.shareEn)){
    const withAssets=restoreGeneratedImages(baseline,shareEn,baseline);
    if(!saveSharingFields(baseline,{shareEn:withAssets},generation))throw new Error('Daily report changed during ShareEn generation.');
    report={...current,shareEn:withAssets};
    options.log?.('info','ShareEn 文案已保存');
   }else if(shareEn)options.log?.('warn','ShareEn 在生成期间已更新，保留最新版本');
   else options.log?.('warn','ShareEn 未生成，保留已有版本');
  }
 }
 if(format!=='english'){
  const copy=getValidShareEn(report);
  if(copy)report=await savePreparedShareEnImages(report,copy,generation,{force:format==='images'&&options.force,topicId:options.topicId,log:options.log});
  else if(format==='images')throw new Error('该日期没有有效的 ShareEn 文案，请先生成 ShareEn。');
 }
 return {report,englishReady:englishReady(report),shareEnReady:!!getValidShareEn(report)};
}

export {shareEnRevision} from './shareen';

export function saveShareEnEdits(reportDate:string,copy:ShareEnCopy,expectedRevision:string):WccatDailyReport {
 const generation=writeGeneration(),report=requireReport(reportDate);
 if(typeof expectedRevision!=='string'||expectedRevision!==shareEnRevision(report.shareEn))throw new Error('ShareEn changed since this editor was loaded; reload before saving.');
 const validated=validateShareEn(copy,report);
 const hydrated=restoreImageAssets(report,validated,getValidShareEn(report),{submitted:copy});
 if(!saveSharingFields(report,{shareEn:hydrated},generation))throw new Error('Daily report changed while saving ShareEn edits.');
 return requireReport(reportDate);
}
