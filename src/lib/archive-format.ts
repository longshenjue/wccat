import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {createReadStream,statSync,statfsSync,mkdirSync} from 'node:fs';
import {BUSINESS_TABLES,DATE_COLUMNS,createBusinessSchema,type BusinessTable} from './db-schema';
import {businessDigest,type CleanupPreview,type ExportMode} from './data-preview';
import {parseRange,type DateRange} from './data-range';
import {dataDir} from './storage-paths';

export type ArchiveMetadata={version:1;schema:1;id:string;month:string;range:DateRange;mode:ExportMode;createdAt:string;counts:Record<BusinessTable,number>;digest:string;preview:CleanupPreview};
export function availableBytes(){
 mkdirSync(dataDir,{recursive:true});const space=statfsSync(dataDir);return Number(space.bavail)*Number(space.bsize);
}
export function requireDisk(bytes:number){
 if(availableBytes()<bytes+16*1024*1024)throw new Error('磁盘剩余空间不足，请缩小日期范围或先扩容。未清理源数据。');
}
export async function fileSha256(file:string){
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
let expectedColumns:Record<string,string[]>|undefined;
function columns(){
 if(!expectedColumns){const db=new Database(':memory:');createBusinessSchema(db);expectedColumns={};for(const table of BUSINESS_TABLES)expectedColumns[table]=(db.prepare('pragma table_info('+table+')').all() as {name:string;type:string}[]).map(v=>v.name+':'+v.type);db.close();}
 return expectedColumns;
}
export function validateArchive(file:string):ArchiveMetadata{
 if(statSync(file).size<100||statSync(file).size>12*1024**3)throw new Error('归档大小无效。');
 const db=new Database(file,{readonly:true,fileMustExist:true});
 try{
  db.pragma('trusted_schema=OFF');db.pragma('query_only=ON');
  const objects=db.prepare("select name,type,sql from sqlite_master where name not like 'sqlite_%'").all() as {name:string;type:string;sql:string}[];
  const allowed=new Set<string>([...BUSINESS_TABLES,'archive_meta']);
  if(objects.some(obj=>obj.type==='view'||obj.type==='trigger'||(obj.type==='table'&&(!allowed.has(obj.name)||/VIRTUAL/i.test(obj.sql)))))throw new Error('归档包含不支持的数据库对象。');
  for(const table of BUSINESS_TABLES){
   const actual=(db.prepare('pragma table_info('+table+')').all() as {name:string;type:string}[]).map(v=>v.name+':'+v.type);
   if(JSON.stringify(actual)!==JSON.stringify(columns()[table]))throw new Error('归档数据结构不兼容：'+table);
  }
  const metaRow=db.prepare('select payload from archive_meta where id=1').get() as {payload:string}|undefined;
  if(!metaRow)throw new Error('归档缺少版本信息。');
  const meta=JSON.parse(metaRow.payload) as ArchiveMetadata;
  if(meta.version!==1||meta.schema!==1||!['daily','full'].includes(meta.mode)||!/^[-a-f0-9]{36}$/.test(meta.id)||!/^\d{4}-\d{2}$/.test(meta.month))throw new Error('归档版本或标识无效。');
  const range=parseRange(meta.range);if(range.start.slice(0,7)!==range.end.slice(0,7)||meta.month!==range.start.slice(0,7))throw new Error('归档月份不匹配。');
  if(db.pragma('integrity_check',{simple:true})!=='ok'||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('归档完整性检查失败。');
  const actual=businessDigest(db,range,meta.mode);
  if(actual.digest!==meta.digest||JSON.stringify(actual.counts)!==JSON.stringify(meta.counts))throw new Error('归档数量或校验值不匹配。');
  for(const table of BUSINESS_TABLES){
   const rows=(db.prepare('select count(*) as n from '+table).get() as {n:number}).n;
   if(rows!==actual.counts[table])throw new Error('归档包含范围外数据：'+table);
   if(['snapshots','daily_reports'].includes(table)){
    for(const row of db.prepare('select '+DATE_COLUMNS[table]+' as key,payload from '+table).iterate() as Iterable<{key:string;payload:string}>){
     const payload=JSON.parse(row.payload);
     if(!payload||!Array.isArray(payload.topics)||!Number.isFinite(Date.parse(payload.generatedAt))||(table==='snapshots'?payload.date:payload.reportDate)!==row.key)throw new Error('归档业务内容无效。');
    }
   }
  }
  return meta;
 }finally{db.close();}
}

