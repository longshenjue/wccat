import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {getDb} from './db';
import {archiveDatabase,archiveEntries} from './archive-catalog';
import {archivesDir} from './storage-paths';

export type ReadSource={id:string;file?:string;snapshotCount?:number};
export type SnapshotVersion={date:string;generatedAt:string;source:ReadSource};
export function readCatalog(start:string,end:string):ReadSource[] {
 return [{id:'main'},...archiveEntries().filter(entry=>entry.meta.range.start<=end&&entry.meta.range.end>=start)
  .map(entry=>({id:entry.file,file:join(archivesDir,entry.file),snapshotCount:entry.meta.counts.snapshots}))];
}
export function sourceDb(source:ReadSource) {return source.file?archiveDatabase(source.file):getDb();}
export function versionOf(row:SnapshotVersion) {
 return createHash('sha256').update(JSON.stringify([row.source.id,row.date,row.generatedAt])).digest('hex').slice(0,32);
}
export function publicVersion(row:SnapshotVersion) {
 return {date:row.date,generatedAt:row.generatedAt,version:versionOf(row),origin:row.source.id==='main'?'main' as const:'archive' as const};
}
/** Descriptors survive the archive connection cache; callers never retain cached handles. */
export function resolveSnapshots(start:string,end:string,collected?:{after:string;through:string}) {
 const winners=new Map<string,SnapshotVersion>();
 const catalog=collected?readCatalog('0000-01-01','9999-12-31').filter(source=>source.snapshotCount!==0):readCatalog(start.slice(0,10),end.slice(0,10));
 for(const source of catalog) {
  // Collection can finish after its hour key: actual-time reports must not bound candidates by that key.
  const args=collected?[collected.after,collected.through]:[start,end];
  const filter=collected?'julianday(generated_at)>julianday(?) and julianday(generated_at)<=julianday(?)':'date>=? and date<=?';
  const rows=sourceDb(source).prepare('select date,generated_at from snapshots where '+filter+' order by date').all(...args) as {date:string;generated_at:string}[];
  for(const row of rows) {
   if(!/^\d{4}-\d{2}-\d{2}-(?:[01]\d|2[0-3])$/.test(row.date)||!Number.isFinite(Date.parse(row.generated_at)))continue;
   const old=winners.get(row.date);
   if(!old||Date.parse(row.generated_at)>Date.parse(old.generatedAt))winners.set(row.date,{date:row.date,generatedAt:row.generated_at,source});
  }
 }
 return [...winners.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function resolveReport(date:string) {
 let winner:SnapshotVersion|undefined;
 for(const source of readCatalog(date,date)) {
  const row=sourceDb(source).prepare('select generated_at from daily_reports where report_date=?').get(date) as {generated_at:string}|undefined;
  if(row&&Number.isFinite(Date.parse(row.generated_at))&&(!winner||Date.parse(row.generated_at)>Date.parse(winner.generatedAt)))winner={date,generatedAt:row.generated_at,source};
 }
 return winner;
}
