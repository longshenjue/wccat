import Database from 'better-sqlite3';
import {createReadStream,createWriteStream,existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,lstatSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {archivesDir} from './storage-paths';
import {availableBytes,fileSha256,validateArchive,type ArchiveMetadata} from './archive-format';

type Entry={file:string;sha256:string;bytes:number;mtimeMs:number;meta:Omit<ArchiveMetadata,'preview'>};
const cache=new Map<string,Database.Database>();
const registry=join(archivesDir,'registry.json');
function registryEntries():Entry[]{
 if(!existsSync(registry))return [];
 if(lstatSync(registry).size>10*1024*1024)throw new Error('归档索引过大。');
 const data=JSON.parse(readFileSync(registry,'utf8'));
 if(!Array.isArray(data)||data.length>5000)throw new Error('归档索引无效。');
 return data.filter((row:Entry)=>row&&/^[a-f0-9]{64}\.sqlite$/.test(row.file));
}
export function archiveEntries():Entry[]{
 return registryEntries().filter(row=>{
  try{const stat=lstatSync(join(archivesDir,row.file));return stat.isFile()&&!stat.isSymbolicLink()&&stat.size===row.bytes&&stat.mtimeMs===row.mtimeMs;}catch{return false;}
 });
}
export function closeArchives(){for(const db of cache.values())db.close();cache.clear();}
export function archiveDatabase(file:string){
 if(!archiveEntries().some(entry=>join(archivesDir,entry.file)===file))throw new Error('归档未注册或文件已改变，请重新校验注册。');
 let db=cache.get(file);
 if(db){cache.delete(file);cache.set(file,db);return db;}
 if(cache.size>=4){const first=cache.keys().next().value!;cache.get(first)!.close();cache.delete(first);}
 db=new Database(file,{readonly:true,fileMustExist:true});db.pragma('trusted_schema=OFF');db.pragma('query_only=ON');cache.set(file,db);return db;
}
export function* archiveSources(){
 for(const entry of archiveEntries())yield archiveDatabase(join(archivesDir,entry.file));
}
export async function registerArchives(paths:string[]){
 if(!paths.length)throw new Error('请提供一个或多个归档文件。');
 mkdirSync(archivesDir,{recursive:true,mode:0o700});
 const lock=join(archivesDir,'registration.lock');
 let fd:number;
 try{fd=openSync(lock,'wx',0o600);}catch{throw new Error('另一个归档注册正在进行；若上次进程已退出，请确认后移除 registration.lock 再重试。');}
 const results:{id:string;duplicate:boolean;file:string}[]=[];
 try{
  let entries=registryEntries();
  for(const source of paths){
   const incoming=join(archivesDir,'.incoming-'+randomUUID()+'.sqlite');
   try{
    let bytes=0;const budget=Math.min(12*1024**3,availableBytes()-32*1024*1024);
    if(budget<=0)throw new Error('空间不足以恢复归档。');
    const cap=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;callback(bytes>budget?new Error('归档解压大小超过可用空间或12GiB上限。'):null,chunk);}});
    const destination=createWriteStream(incoming,{flags:'wx',mode:0o600});
    if(source.endsWith('.gz'))await pipeline(createReadStream(source),createGunzip(),cap,destination);
    else await pipeline(createReadStream(source),cap,destination);
    const meta=validateArchive(incoming),sha256=await fileSha256(incoming);
    const previous=entries.find(e=>e.sha256===sha256||(e.meta.digest===meta.digest&&e.meta.mode===meta.mode&&e.meta.range.start===meta.range.start&&e.meta.range.end===meta.range.end));
    if(previous&&existsSync(join(archivesDir,previous.file))){
     if(await fileSha256(join(archivesDir,previous.file))!==previous.sha256)throw new Error('已注册归档内容已改变，请修复后重试。');
     results.push({id:meta.id,duplicate:true,file:previous.file});continue;
    }
    const file=sha256+'.sqlite',target=join(archivesDir,file);
    renameSync(incoming,target);
    const stat=lstatSync(target),{preview:_,...summary}=meta;
    entries=entries.filter(e=>e.file!==file);
    entries.push({file,sha256,bytes:stat.size,mtimeMs:stat.mtimeMs,meta:summary});
    const temp=registry+'.'+randomUUID()+'.tmp';
    writeFileSync(temp,JSON.stringify(entries),{flag:'wx',mode:0o600});renameSync(temp,registry);
    results.push({id:meta.id,duplicate:false,file});
   }finally{rmSync(incoming,{force:true});}
  }
  return results;
 }finally{closeSync(fd);rmSync(lock,{force:true});}
}

