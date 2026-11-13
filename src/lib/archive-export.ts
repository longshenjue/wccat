import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {mkdirSync,createReadStream,createWriteStream,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {BUSINESS_TABLES,ORDER_COLUMNS,createBusinessSchema} from './db-schema';
import {businessDigest,previewCleanup,rangeQuery,type ExportMode} from './data-preview';
import {fileSha256,requireDisk,validateArchive,type ArchiveMetadata} from './archive-format';
import {dbPath,exportsDir} from './storage-paths';
import type {DateRange} from './data-range';
export type ArchiveFile={id:string;name:string;path:string;sqlitePath:string;sha256:string;meta:ArchiveMetadata;downloaded?:boolean};
export async function exportMonth(range:DateRange,mode:ExportMode,progress:(text:string)=>void=()=>{},cancelled:()=>boolean=()=>false,jobId?:string):Promise<ArchiveFile>{
 if(range.start.slice(0,7)!==range.end.slice(0,7))throw new Error('每个归档包只能包含一个月。');
 if(cancelled())throw new Error('任务已取消。');
 if(jobId&&!/^[a-f0-9-]{36}$/.test(jobId))throw new Error('导出任务标识无效。');
 const id=randomUUID(),folder=jobId?join(exportsDir,jobId,id):join(exportsDir,id),name='wccat-'+range.start.slice(0,7)+'-'+range.start+'_'+range.end+'-'+id+'.sqlite.gz';
 mkdirSync(folder,{recursive:true,mode:0o700});
 const sqlitePath=join(folder,'data.sqlite'),path=join(folder,name);
 const source=new Database(dbPath,{readonly:true,fileMustExist:true});
 let target:Database.Database|undefined;
 try{
  source.pragma('query_only=ON');source.exec('begin');
  const facts=businessDigest(source,range,mode);
  requireDisk(facts.bytes*4+2*1024*1024);
  const preview=previewCleanup(source,range);
  target=new Database(sqlitePath);target.pragma('journal_mode=DELETE');createBusinessSchema(target);
  target.exec('begin');
  let copied=0;
  for(const table of BUSINESS_TABLES){
   if(mode==='daily'&&table!=='daily_reports')continue;
   const query=rangeQuery(table,range),cols=(target.prepare('pragma table_info('+table+')').all() as {name:string}[]).map(v=>v.name);
   const insert=target.prepare('insert into '+table+' ('+cols.join(',')+') values('+cols.map(()=>'?').join(',')+')');
   for(const row of source.prepare('select * from '+table+' where '+query.sql+' order by '+ORDER_COLUMNS[table]).iterate(...query.args) as Iterable<Record<string,unknown>>){
    if(cancelled())throw new Error('任务已取消。');
    insert.run(...cols.map(col=>row[col]));
    if(++copied%500===0){progress('正在导出 '+table+'，已复制 '+copied+' 条');await new Promise<void>(resolve=>setImmediate(resolve));}
   }
  }
  const meta:ArchiveMetadata={version:1,schema:1,id,month:range.start.slice(0,7),range,mode,createdAt:new Date().toISOString(),counts:facts.counts,digest:facts.digest,preview};
  target.exec('create table archive_meta(id integer primary key check(id=1),payload text not null)');
  target.prepare('insert into archive_meta values(1,?)').run(JSON.stringify(meta));
  target.exec('commit');target.close();target=undefined;
  source.exec('commit');source.close();
  validateArchive(sqlitePath);
  progress('正在压缩归档');
  await pipeline(createReadStream(sqlitePath),createGzip(),createWriteStream(path,{flags:'wx',mode:0o600}));
  if(cancelled())throw new Error('任务已取消。');
  return {id,name,path,sqlitePath,sha256:await fileSha256(path),meta};
 }catch(error){
  try{target?.close();}catch{}
  if(source.open)source.close();
  rmSync(folder,{recursive:true,force:true});throw error;
 }
}

