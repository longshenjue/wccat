import {createReadStream,statSync} from 'node:fs';
import {Readable} from 'node:stream';
import {requireAdmin,readAdminJson,adminErrorResponse,AdminError} from '@/lib/admin-auth';
import {dataSummary} from '@/lib/admin-data-stats';
import {createJob,getJobs,cancelJob,discardExport,exportFile,markDownloaded,getCleanupPreview,type JobInput} from '@/lib/admin-jobs';
import {dailyGenerationPreview} from '@/lib/admin-daily';
import {readJobLogs} from '@/lib/admin-job-logs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
function failure(error:unknown){return adminErrorResponse(error instanceof AdminError?error:new AdminError(error instanceof Error?error.message:'操作失败。'));}
export async function GET(request:Request){
 try{
  requireAdmin(request);
  const url=new URL(request.url);
  if(url.searchParams.has('daily'))return json({preview:dailyGenerationPreview(url.searchParams.get('daily'))});
  if(url.searchParams.has('logs'))return json(readJobLogs(url.searchParams.get('logs')!));
  if(url.searchParams.has('download')){
   const jobId=url.searchParams.get('download')!,fileId=url.searchParams.get('file')??'';
   const file=exportFile(jobId,fileId),stream=createReadStream(file.path);
   const abort=()=>stream.destroy(new Error('Download cancelled'));
   request.signal.addEventListener('abort',abort,{once:true});
   stream.once('end',()=>{try{markDownloaded(jobId,fileId);}catch{}});
   stream.once('close',()=>request.signal.removeEventListener('abort',abort));
   return new Response(Readable.toWeb(stream) as ReadableStream,{headers:{'content-type':'application/gzip','content-disposition':'attachment; filename="'+file.name+'"','content-length':String(statSync(file.path).size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(url.searchParams.has('preview'))return json({preview:getCleanupPreview(url.searchParams.get('preview')!)});
  if(url.searchParams.has('jobs'))return json({jobs:getJobs()});
  return json({summary:dataSummary(),jobs:getJobs()});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 try{
  requireAdmin(request,true);
  const body=await readAdminJson(request),action=body.action;
  if(action==='cancel'||action==='discard'){
   if(typeof body.id!=='string')throw new AdminError('任务标识无效。');
   if(action==='cancel')cancelJob(body.id);
   else{if(body.confirmation!=='移除临时归档')throw new AdminError('请确认移除临时归档。');discardExport(body.id);}
   return json({ok:true});
  }
  if(!['preview','export','cleanup','prepare','reclaim','daily'].includes(String(action)))throw new AdminError('操作无效。');
  if(action==='cleanup'&&body.confirmation!=='清理小时数据')throw new AdminError('请输入“清理小时数据”确认。');
  if(action==='prepare'&&body.confirmation!=='启用空间回收')throw new AdminError('请确认启用空间回收。');
  const input:JobInput={kind:action as JobInput['kind']};
  if(action==='daily')input.reportDate=typeof body.reportDate==='string'?body.reportDate:undefined;
  if(action==='preview'||action==='export')input.range=body.range as JobInput['range'];
  if(action==='export')input.mode=body.mode as JobInput['mode'];
  for(const key of ['previewId','exportJobId'] as const)if(typeof body[key]==='string')input[key]=body[key];
  for(const key of ['ackDownloaded','discardHourly','ackMissingReports'] as const)input[key]=body[key]===true;
  return json({job:createJob(input)},202);
 }catch(error){return failure(error);}
}

