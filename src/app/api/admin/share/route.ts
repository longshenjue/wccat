import {AdminError,adminErrorResponse,readAdminJson,requireAdmin} from '@/lib/admin-auth';
import {createJob,type JobInput} from '@/lib/admin-jobs';
import {readDailyReportFromDb} from '@/lib/db';
import {parseDailyReportDate} from '@/lib/daily-window';
import {saveShareEnEdits} from '@/lib/sharing';
import {sharingReportForClient} from '@/lib/shareen-image-state';
import {shareEnRevision} from '@/lib/shareen';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
function failure(error:unknown){return adminErrorResponse(error instanceof AdminError?error:new AdminError(error instanceof Error?error.message:'分享操作失败。'));}
function reportForDate(date:unknown){
 parseDailyReportDate(date);
 const report=readDailyReportFromDb(date as string);
 if(!report)throw new AdminError('该日期尚无日报，请先生成日报。',404);
 return report;
}
const sharingPayload=(report:ReturnType<typeof reportForDate>)=>({report:sharingReportForClient(report),shareEnRevision:shareEnRevision(report.shareEn)});
export async function GET(request:Request){
 try{
  requireAdmin(request);
  return json(sharingPayload(reportForDate(new URL(request.url).searchParams.get('date'))));
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{
  requireAdmin(request,true);
  const body=await readAdminJson(request,128*1024);
  if(body.action!=='generate'&&body.action!=='save')throw new AdminError('分享操作无效。');
  reportForDate(body.date);
  const date=body.date as string;
  if(body.action==='save'){
   if(!body.copy||typeof body.copy!=='object'||Array.isArray(body.copy))throw new AdminError('分享文案格式无效。');
   if(typeof body.expectedRevision!=='string'||!body.expectedRevision.trim()||body.expectedRevision.length>128)throw new AdminError('分享编辑版本无效，请重新读取后保存。');
   try{return json(sharingPayload(saveShareEnEdits(date,body.copy as Parameters<typeof saveShareEnEdits>[1],body.expectedRevision)));}
   catch(error){
    if(error instanceof Error&&['ShareEn changed since this editor was loaded; reload before saving.','Daily report changed while saving ShareEn edits.'].includes(error.message))throw new AdminError('分享版本已改变，请载入最新版本后保存。',409);
    throw error;
   }
  }
  const format=body.format??'all';
  if(format!=='all'&&format!=='english'&&format!=='shareen'&&format!=='images')throw new AdminError('分享生成类型无效。');
  if(body.force!==undefined&&typeof body.force!=='boolean')throw new AdminError('强制重生成参数无效。');
  if(body.topicId!==undefined&&typeof body.topicId!=='string')throw new AdminError('焦点配图标识无效。');
  const input:JobInput={kind:'sharing',reportDate:date,shareFormat:format,topicId:body.topicId,force:body.force===true};
  return json({job:createJob(input)},202);
 }catch(error){return failure(error);}
}
