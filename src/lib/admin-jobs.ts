import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {spawn} from 'node:child_process';
import {resolve,join,sep} from 'node:path';
import {existsSync,rmSync,unlinkSync} from 'node:fs';
import {getDb} from './db';
import {dbPath,exportsDir} from './storage-paths';
import {parseRange,splitMonths,type DateRange} from './data-range';
import {previewCleanup,businessDigest,type CleanupPreview,type ExportMode} from './data-preview';
import {exportMonth,type ArchiveFile} from './archive-export';
import {cleanupData,maintainStorage,storageUsage} from './data-cleanup';
import {fileSha256} from './archive-format';
import {processAlive,processStamp} from './maintenance';

export type JobInput={kind:'preview'|'export'|'cleanup'|'prepare'|'reclaim';range?:DateRange;mode?:ExportMode;previewId?:string;exportJobId?:string;ackDownloaded?:boolean;discardHourly?:boolean;ackMissingReports?:boolean};
export type JobResult={preview?:CleanupPreview;previewId?:string;files?:ArchiveFile[];cleanup?:Awaited<ReturnType<typeof cleanupData>>;storage?:Awaited<ReturnType<typeof maintainStorage>>};
export type AdminJob={id:string;kind:JobInput['kind'];status:string;input:JobInput;result:JobResult;error:string|null;progress:string;pid:number|null;host:string|null;createdAt:number;updatedAt:number;cancelled:boolean};
type JobRow={id:string;kind:JobInput['kind'];status:string;input:string;result:string|null;error:string|null;progress:string|null;pid:number|null;host:string|null;process_stamp:string|null;created_at:number;updated_at:number;cancelled:number};
const idPattern=/^[a-f0-9-]{36}$/;
function fromRow(row:JobRow):AdminJob{return {id:row.id,kind:row.kind,status:row.status,input:JSON.parse(row.input),result:row.result?JSON.parse(row.result):{},error:row.error,progress:row.progress??'',pid:row.pid,host:row.host,createdAt:row.created_at,updatedAt:row.updated_at,cancelled:Boolean(row.cancelled)};}
export function getJob(id:string):AdminJob{
 if(!idPattern.test(id))throw new Error('任务标识无效。');
 const row=getDb().prepare('select * from admin_jobs where id=?').get(id) as JobRow|undefined;
 if(!row)throw new Error('任务不存在。');return fromRow(row);
}
function recoverJobs(){
 const now=Date.now();
 for(const row of getDb().prepare("select * from admin_jobs where status in ('queued','running')").all() as JobRow[]){
  if((row.pid&&!processAlive(row.pid,row.host,row.process_stamp))||(!row.pid&&now-row.created_at>60000)){
   const recovered=getDb().prepare("update admin_jobs set status='failed',error=?,updated_at=? where id=? and status in ('queued','running') and pid is ? and process_stamp is ?").run('服务重启或任务进程退出；请检查任务结果后重试。',now,row.id,row.pid,row.process_stamp);
   if(recovered.changes&&row.kind==='export')rmSync(jobExportDirectory(row.id),{recursive:true,force:true});
  }
 }
}
export function getJobs(){
 recoverJobs();return (getDb().prepare("select * from admin_jobs where id in (select id from admin_jobs order by created_at desc limit 30) or (kind='export' and status='ready') order by created_at desc").all() as JobRow[]).map(fromRow);
}
function previewById(id:string|undefined):CleanupPreview{
 if(!id||!idPattern.test(id))throw new Error('请先生成清理预览。');
 const row=getDb().prepare('select payload,created_at from admin_previews where id=?').get(id) as {payload:string;created_at:number}|undefined;
 if(!row||Date.now()-row.created_at>86400000)throw new Error('预览不存在或已过期，请重新预览。');
 return JSON.parse(row.payload);
}
export function getCleanupPreview(id:string){return previewById(id);}
function verifyProof(input:JobInput,preview:CleanupPreview){
 if(preview.daysWithoutReports.length&&!input.ackMissingReports)throw new Error('请确认未生成日报的日期也允许清理。');
 if(input.exportJobId){
  const exported=getJob(input.exportJobId);
  if(exported.kind!=='export'||exported.status!=='ready'||exported.input.mode!=='full'||exported.input.previewId!==input.previewId)throw new Error('必须使用这次预览对应的完整归档。');
  if(!input.ackDownloaded)throw new Error('请确认已保存并核对下载文件。');
  const files=exported.result.files;
  if(!files?.length||files.some(file=>!file.downloaded||!existsSync(file.path)))throw new Error('请先完整下载全部月份归档。');
  return files;
 }
 if(!input.discardHourly)throw new Error('请明确确认放弃这些小时历史，或先下载完整归档。');
 return [];
}
export function createJob(input:JobInput):AdminJob{
 if(!['preview','export','cleanup','prepare','reclaim'].includes(input.kind))throw new Error('任务类型无效。');
 if(input.kind==='preview'||input.kind==='export')input={...input,range:parseRange(input.range)};
 if(input.kind==='export'&&!['full','daily'].includes(input.mode??''))throw new Error('归档类型无效。');
 if(input.kind==='cleanup')verifyProof(input,previewById(input.previewId));
 recoverJobs();
 const id=randomUUID(),now=Date.now();
 getDb().transaction(()=>{
  if(getDb().prepare("select id from admin_jobs where status in ('queued','running') limit 1").get())throw new Error('已有后台任务正在运行，请等待完成。');
  getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,?,'queued',?,?,?)").run(id,input.kind,JSON.stringify(input),now,now);
 }).immediate();
 try{
  const child=spawn(process.execPath,['--import','tsx',resolve('scripts/admin-job.ts'),id],{cwd:process.cwd(),env:process.env,stdio:'ignore'});
  getDb().prepare("update admin_jobs set pid=?,host=?,process_stamp=? where id=? and status='queued'").run(child.pid??null,hostname(),child.pid?processStamp(child.pid):null,id);
  child.on('error',()=>getDb().prepare("update admin_jobs set status='failed',error=?,updated_at=? where id=?").run('无法启动后台任务进程。',Date.now(),id));
  child.unref();
 }catch(error){
  getDb().prepare("update admin_jobs set status='failed',error=?,updated_at=? where id=?").run('无法启动后台任务。',Date.now(),id);throw error;
 }
 return getJob(id);
}
export function cancelJob(id:string){
 const job=getJob(id);
 if(!['queued','running'].includes(job.status))throw new Error('任务已结束。');
 if(job.kind!=='preview'&&job.kind!=='export')throw new Error('清理和空间回收开始后不能中断；请等待完成。');
 getDb().prepare('update admin_jobs set cancelled=1,updated_at=? where id=?').run(Date.now(),id);
}
export function markDownloaded(jobId:string,fileId:string){
 const job=getJob(jobId);
 if(job.status!=='ready'||job.kind!=='export')return;
 const files=job.result.files;if(!files)return;
 const file=files.find(value=>value.id===fileId);if(!file)return;
 file.downloaded=true;
 getDb().prepare("update admin_jobs set result=?,updated_at=? where id=? and status='ready'").run(JSON.stringify({...job.result,files}),Date.now(),jobId);
}
export function exportFile(jobId:string,fileId:string){
 if(!idPattern.test(fileId))throw new Error('文件标识无效。');
 const job=getJob(jobId),file=job.result.files?.find(item=>item.id===fileId);
 if(job.kind!=='export'||job.status!=='ready'||!file||!existsSync(file.path))throw new Error('文件不存在或已过期，请重新导出。');
 if(!file.path.startsWith(join(jobExportDirectory(jobId),file.id)+sep))throw new Error('归档路径无效。');
 return file;
}
export function discardExport(id:string){
 const job=getJob(id);
 if(job.kind!=='export'||['queued','running'].includes(job.status))throw new Error('导出任务尚未结束。');
 if(getJobs().some(item=>['queued','running'].includes(item.status)))throw new Error('后台任务运行中，暂不能移除导出文件。');
 expireExportFiles(job);
}
function expireExportFiles(job:AdminJob){
 rmSync(jobExportDirectory(job.id),{recursive:true,force:true});
 getDb().prepare("update admin_jobs set status='expired',updated_at=? where id=?").run(Date.now(),job.id);
}
function jobExportDirectory(id:string){
 if(!idPattern.test(id))throw new Error('任务标识无效。');
 return join(exportsDir,id);
}
export async function runJob(id:string){
 let job=getJob(id);if(job.status!=='queued')throw new Error('任务已经运行或结束。');
 const changed=getDb().prepare("update admin_jobs set status='running',pid=?,host=?,process_stamp=?,updated_at=? where id=? and status='queued'").run(process.pid,hostname(),processStamp(process.pid),Date.now(),id);
 if(changed.changes!==1)throw new Error('另一个进程已领取任务。');
 const progress=(text:string)=>getDb().prepare('update admin_jobs set progress=?,updated_at=? where id=?').run(text,Date.now(),id);
 const cancelled=()=>Boolean((getDb().prepare('select cancelled from admin_jobs where id=?').get(id) as {cancelled:number}).cancelled);
 const files:ArchiveFile[]=[];
 try{
  const input=job.input;let result:JobResult={};let status='complete';
  if(cancelled())throw new Error('任务已取消。');
  if(input.kind==='preview'){
   progress('正在统计所选范围、日报覆盖与数据版本');
   const source=new Database(dbPath,{readonly:true,fileMustExist:true});
   let preview:CleanupPreview;try{source.exec('begin');preview=previewCleanup(source,parseRange(input.range));source.exec('commit');}finally{source.close();}
   if(cancelled())throw new Error('任务已取消。');
   const previewId=randomUUID();getDb().prepare('insert into admin_previews values(?,?,?)').run(previewId,JSON.stringify(preview),Date.now());
   result={preview,previewId};
  }else if(input.kind==='export'){
   const expired=getDb().prepare("select * from admin_jobs where kind='export' and status='ready' and updated_at<?").all(Date.now()-86400000) as JobRow[];
   for(const old of expired)expireExportFiles(fromRow(old));
   const range=parseRange(input.range),preview=previewById(input.previewId);
   if(JSON.stringify(range)!==JSON.stringify(preview.range)||previewCleanup(getDb(),range,Date.now(),preview.cutoff).digest!==preview.digest)throw new Error('数据版本已改变，请重新预览。');
   for(const part of splitMonths(range)){
    const file=await exportMonth(part,input.mode!,progress,cancelled,id);files.push(file);
    // The compressed archive was already verified; avoid keeping a second full-size copy.
    unlinkSync(file.sqlitePath);
   }
   result={files,previewId:input.previewId};status='ready';
  }else if(input.kind==='cleanup'){
   const preview=previewById(input.previewId),proof=verifyProof(input,preview);
   for(const file of proof){
    progress('正在重新校验已下载的完整归档');
    if(await fileSha256(file.path)!==file.sha256||businessDigest(getDb(),file.meta.range,'full').digest!==file.meta.digest)throw new Error('归档文件或源数据版本已改变，请重新导出。');
   }
   result={cleanup:await cleanupData(preview,progress,cancelled,(deleted,before)=>{
    getDb().prepare('update admin_jobs set result=?,progress=?,updated_at=? where id=?').run(JSON.stringify({cleanup:{logicalDeleted:true,reclaimed:false,deleted,before,after:before,reclaimedBytes:0,reclaimError:'小时清理已提交；空间回收尚未完成。'}}),'小时清理已提交，正在回收空间',Date.now(),id);
   })};
   if(input.exportJobId){
    expireExportFiles(getJob(input.exportJobId));
    result.cleanup!.after=storageUsage();
   }
  }else{
   result={storage:await maintainStorage(input.kind,progress)};
  }
  getDb().prepare('update admin_jobs set status=?,result=?,progress=?,updated_at=? where id=?').run(status,JSON.stringify(result),'任务完成',Date.now(),id);
 }catch(error){
  if(job.kind==='export')rmSync(jobExportDirectory(id),{recursive:true,force:true});
  const message=error instanceof Error?error.message:'任务失败。';
  getDb().prepare('update admin_jobs set status=?,error=?,updated_at=? where id=?').run(message.includes('取消')?'cancelled':'failed',message,Date.now(),id);
 }finally{job=getJob(id);}
 return job;
}

