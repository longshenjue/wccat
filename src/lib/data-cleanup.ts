import type Database from 'better-sqlite3';
import {existsSync,statSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {getDb} from './db';
import {dbPath,exportsDir,archivesDir} from './storage-paths';
import {availableBytes,requireDisk} from './archive-format';
import {previewCleanup,type CleanupPreview} from './data-preview';
import {acquireMaintenance,advanceGeneration,releaseMaintenance} from './maintenance';
const size=(file:string)=>{try{return statSync(file).size;}catch{return 0;}};
function folderBytes(dir:string):number{
 if(!existsSync(dir))return 0;let bytes=0;
 for(const name of readdirSync(dir)){try{const file=join(dir,name),stat=lstatSync(file);if(stat.isSymbolicLink())continue;bytes+=stat.isDirectory()?folderBytes(file):stat.size;}catch{}}
 return bytes;
}
export function storageUsage(){
 const db=getDb();
 return {databaseBytes:size(dbPath),walBytes:size(dbPath+'-wal'),exportsBytes:folderBytes(exportsDir),archivesBytes:folderBytes(archivesDir),availableBytes:availableBytes(),reusableBytes:Number(db.pragma('freelist_count',{simple:true}))*Number(db.pragma('page_size',{simple:true})),incremental:Number(db.pragma('auto_vacuum',{simple:true}))===2};
}
function checkpoint(db:Database.Database){
 const results=db.pragma('wal_checkpoint(TRUNCATE)') as {busy:number}[];
 if(results.some(row=>row.busy))throw new Error('数据库仍有读取事务，暂时无法回收空间，请稍后重试。');
}
export async function prepareDatabaseStorage(db:Database.Database,progress:(text:string)=>void=()=>{}){
 if(Number(db.pragma('auto_vacuum',{simple:true}))===2)return;
 requireDisk(size(dbPath)*2+8*1024*1024);
 progress('正在为历史数据库启用空间回收；源记录将保留');
 checkpoint(db);db.pragma('auto_vacuum=INCREMENTAL');db.exec('VACUUM');checkpoint(db);
}
async function reclaim(db:Database.Database,progress:(text:string)=>void){
 checkpoint(db);let free=Number(db.pragma('freelist_count',{simple:true})),step=0;
 while(free>0){
  db.pragma('incremental_vacuum(256)');checkpoint(db);
  const after=Number(db.pragma('freelist_count',{simple:true}));
  if(after>=free||++step>100000)throw new Error('空间尚未全部回收，请运行回收任务重试。');
  free=after;progress('正在回收空间，剩余空闲页 '+free);
  await new Promise<void>(resolve=>setImmediate(resolve));
 }checkpoint(db);
}
export async function maintainStorage(kind:'prepare'|'reclaim',progress:(text:string)=>void=()=>{}){
 const db=getDb(),owner=randomUUID(),before=storageUsage();acquireMaintenance(db,owner);
 try{await prepareDatabaseStorage(db,progress);if(kind==='reclaim')await reclaim(db,progress);return {before,after:storageUsage()};}
 finally{releaseMaintenance(db,owner);}
}
export async function cleanupData(preview:CleanupPreview,progress:(text:string)=>void=()=>{},cancelled:()=>boolean=()=>false,onCommitted?:(deleted:CleanupPreview['counts'],before:ReturnType<typeof storageUsage>)=>void){
 if(cancelled())throw new Error('任务已取消。');
 const db=getDb(),owner=randomUUID(),before=storageUsage();acquireMaintenance(db,owner);
 try{
  // Space preparation is before deletion: initialization failure preserves every source row.
  await prepareDatabaseStorage(db,progress);
  requireDisk(1024*1024);
  if(cancelled())throw new Error('任务已取消。');
  const current=previewCleanup(db,preview.range,Date.now(),preview.cutoff);
  if(current.digest!==preview.digest||JSON.stringify(current.eligibleDates)!==JSON.stringify(preview.eligibleDates))throw new Error('数据版本已经改变，请重新预览或导出后再清理。');
  progress('正在清理已确认的小时记录；全部日报保留');
  db.transaction(()=>{
   const latest=previewCleanup(db,preview.range,Date.now(),preview.cutoff);
   if(latest.digest!==preview.digest)throw new Error('数据版本已经改变。');
   const removeLogs=db.prepare('delete from ai_analysis_logs where snapshot_date=?');
   const removeSnapshot=db.prepare('delete from snapshots where date=?');
   const tombstone=db.prepare('insert or replace into cleared_hours(date,cleared_at) values(?,?)');
   for(const date of current.eligibleDates){removeLogs.run(date);removeSnapshot.run(date);tombstone.run(date,new Date().toISOString());}
   advanceGeneration(db,owner);
   onCommitted?.({...current.counts,daily_reports:0},before);
  }).immediate();
  const deleted={...current.counts,daily_reports:0};
  try{await reclaim(db,progress);const after=storageUsage();return {logicalDeleted:true,reclaimed:true,deleted,before,after,reclaimedBytes:Math.max(0,before.databaseBytes+before.walBytes-after.databaseBytes-after.walBytes)};}
  catch(error){return {logicalDeleted:true,reclaimed:false,deleted,before,after:storageUsage(),reclaimedBytes:0,reclaimError:error instanceof Error?error.message:'空间回收尚未完成，请重试回收任务。'};}
 }finally{releaseMaintenance(db,owner);}
}

