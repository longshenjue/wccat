import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {mkdir,chmod,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {EvidenceStore} from './evidence-store';
import {EVIDENCE_SCHEMA_VERSION,EVIDENCE_TABLES} from './evidence-schema';
import {BUSINESS_TABLES} from './db-schema';
import {evidenceHash,canonicalEvidence} from './evidence-content';
import {ensureMaintenanceSchema,guardedWrite,readGeneration} from './maintenance';
import type {RawHotItem,DailySnapshot} from './types';
import type {TopicAnalysis,TopicAnalysisTrace} from './topic-analysis';
import {legacyEvidenceItem} from './evidence-mapping';
import {recordLegacyAnalysis,recordAnalysisTrace} from './evidence-legacy';
import {validateProviderSchema} from './provider-state';

type BackupManifest={version:1;schema:number;createdAt:string;sha256:string;bytes:number;counts:Record<string,number>};
const quoted=(name:string)=>'"'+name.replaceAll('"','""')+'"';
async function fileDigest(path:string) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');
}
function tableCounts(db:Database.Database) {
  return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[])
    .map(({name})=>[name,(db.prepare('select count(*) as n from '+quoted(name)).get() as {n:number}).n]));
}
function requireCompleteSchema(db:Database.Database) {
  validateProviderSchema(db);
  const names=new Set((db.prepare("select name from sqlite_master where type='table'").all() as {name:string}[]).map(row=>row.name));
  for(const table of [...BUSINESS_TABLES,...EVIDENCE_TABLES])if(!names.has(table))throw new Error('完整备份缺少必需数据表：'+table);
  const version=db.prepare('select version from library_meta where id=1').get() as {version:number}|undefined;
  if(version?.version!==EVIDENCE_SCHEMA_VERSION)throw new Error('完整备份 schema 版本不兼容');
}

export async function backupEvidenceDatabase(db:Database.Database,directory:string) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const path=join(directory,'wccat-complete-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.sqlite');
  try {
    // SQLite's backup API includes committed WAL data and yields a consistent copy.
    await db.backup(path);await chmod(path,0o600);
    const copy=new Database(path,{readonly:true,fileMustExist:true});
    let counts:Record<string,number>;
    try {
      copy.pragma('query_only=ON');copy.pragma('trusted_schema=OFF');
      requireCompleteSchema(copy);
      if(copy.pragma('integrity_check',{simple:true})!=='ok'||(copy.pragma('foreign_key_check') as unknown[]).length)throw new Error('完整备份校验失败');
      counts=tableCounts(copy);
    }finally{copy.close();}
    const manifest:BackupManifest={version:1,schema:EVIDENCE_SCHEMA_VERSION,createdAt:new Date().toISOString(),sha256:await fileDigest(path),bytes:(await stat(path)).size,counts};
    await writeFile(path+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    await verifyEvidenceBackup(path);
    return {path,manifestPath:path+'.manifest.json',manifest};
  }catch(error) {
    await rm(path,{force:true});await rm(path+'.manifest.json',{force:true});throw error;
  }
}

export async function verifyEvidenceBackup(path:string) {
  const manifest=JSON.parse(await readFile(path+'.manifest.json','utf8')) as BackupManifest;
  if(manifest.version!==1||manifest.schema!==EVIDENCE_SCHEMA_VERSION||manifest.bytes!==(await stat(path)).size||manifest.sha256!==await fileDigest(path))throw new Error('完整备份 hash/大小/版本校验失败');
  const db=new Database(path,{readonly:true,fileMustExist:true});
  try {
    db.pragma('query_only=ON');db.pragma('trusted_schema=OFF');
    requireCompleteSchema(db);
    if(db.pragma('integrity_check',{simple:true})!=='ok'||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('完整备份引用校验失败');
    const counts=tableCounts(db);
    if(JSON.stringify(counts)!==JSON.stringify(manifest.counts))throw new Error('完整备份行数校验失败');
    const store=new EvidenceStore(db);
    for(const row of db.prepare('select hash from library_blobs').iterate() as Iterable<{hash:string}>)store.readBlob(row.hash);
    return manifest;
  }finally{db.close();}
}

/** Explicit CLI operation; no startup scan and no writes to registered archives. */
export function backfillEvidence(db:Database.Database,options:{limit?:number;force?:boolean}={}) {
  const limit=options.limit??5;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('回填批次 limit 必须为 1–100');
  ensureMaintenanceSchema(db);const generation=readGeneration(db),store=new EvidenceStore(db);
  let processed=0,runs=0;
  const rows=db.prepare(`select date,payload from snapshots ${options.force?'':'where date not in (select snapshot_date from library_backfill_state)'} order by date limit ?`).all(limit) as {date:string;payload:string}[];
  for(const row of rows)guardedWrite(db,()=>{
    const payload=JSON.parse(row.payload) as DailySnapshot;
    const hash=evidenceHash(row.payload);
    const captured=payload.evidenceRunIds?.length&&payload.evidenceRunIds.every(id=>{
      const run=db.prepare('select legacy_snapshot_date from collection_runs where id=?').get(id) as {legacy_snapshot_date:string}|undefined;
      return run?.legacy_snapshot_date===row.date;
    });
    const groups=new Map<string,RawHotItem[]>();
    for(const item of payload.rawItems??[]) {
      const list=groups.get(item.sourceId)??[];list.push(item);groups.set(item.sourceId,list);
    }
    for(const [platform,items] of captured?[]:groups) {
      const liveId='snapshot:'+evidenceHash(canonicalEvidence({date:payload.date,generatedAt:payload.generatedAt,platform,items}));
      if(db.prepare('select id from collection_runs where id=?').get(liveId))continue;
      store.recordBatch({id:'legacy:'+row.date+':'+hash+':'+platform,source:{provider:'legacy',platform,adapter:'backfill-v1',capability:'hotlist'},
        status:items.length?'success':'empty',observedAt:items[0]?.fetchedAt??payload.generatedAt,provenance:'legacy_normalized',legacySnapshotDate:row.date,
        items:items.map(legacyEvidenceItem)});runs++;
    }
    for(const analysis of db.prepare('select topic_id,payload,generated_at from topic_analyses where snapshot_date=?').all(row.date) as {topic_id:string;payload:string;generated_at:string}[]) {
      recordLegacyAnalysis(db,row.date,analysis.topic_id,JSON.parse(analysis.payload) as TopicAnalysis,undefined,
        {id:'legacy-analysis:'+row.date+':'+analysis.topic_id+':'+evidenceHash(analysis.payload),generatedAt:analysis.generated_at});
    }
    for(const log of db.prepare('select * from ai_analysis_logs where snapshot_date=?').all(row.date) as {id:number;topic_id:string;provider:TopicAnalysisTrace['provider'];model:string;status:string;duration_ms:number;used_fallback:number;error:string|null;request_payload:string;response_payload:string;created_at:string}[]) {
      recordAnalysisTrace(db,row.date,log.topic_id,{provider:log.provider,model:log.model,status:log.status,durationMs:log.duration_ms,
        usedFallback:Boolean(log.used_fallback),error:log.error??undefined,request:JSON.parse(log.request_payload),response:JSON.parse(log.response_payload)},
        {id:'legacy-trace:'+log.id+':'+evidenceHash(log.request_payload+log.response_payload),generatedAt:log.created_at,legacyLogId:log.id});
    }
    db.prepare('insert into library_backfill_state values(?,?,?) on conflict(snapshot_date) do update set payload_hash=excluded.payload_hash,completed_at=excluded.completed_at')
      .run(row.date,hash,new Date().toISOString());processed++;
  },generation);
  return {processed,runs,remaining:(db.prepare('select count(*) as n from snapshots where date not in (select snapshot_date from library_backfill_state)').get() as {n:number}).n};
}
