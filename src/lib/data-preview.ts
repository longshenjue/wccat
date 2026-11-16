import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {BUSINESS_TABLES,DATE_COLUMNS,ORDER_COLUMNS,type BusinessTable} from './db-schema';
import {nextDay,type DateRange} from './data-range';

export type ExportMode='full'|'daily';
export type CleanupPreview={range:DateRange;cutoff:number;digest:string;counts:Record<BusinessTable,number>;eligibleDates:string[];protected:number;dailyKept:number;daysWithoutReports:string[];estimatedBytes:number};
function canonicalRow(row:unknown){
 const record=row as Record<string,unknown>;
 return JSON.stringify(Object.fromEntries(Object.keys(record).sort().map(key=>[key,record[key]])))+'\n';
}
export function rangeQuery(table:BusinessTable,range:DateRange){
 const daily=table==='daily_reports';
 return {sql:DATE_COLUMNS[table]+' >= ? and '+DATE_COLUMNS[table]+' < ?',args:daily?[range.start,nextDay(range.end)]:[range.start+'-00',nextDay(range.end)+'-00']};
}
export function businessDigest(db:Database.Database,range:DateRange,mode:ExportMode='full'){
 const hash=createHash('sha256'),counts={} as Record<BusinessTable,number>;let bytes=0;
 for(const table of BUSINESS_TABLES){
  counts[table]=0;hash.update(table+'\n');
  if(mode==='daily'&&table!=='daily_reports')continue;
  const query=rangeQuery(table,range);
  for(const row of db.prepare('select * from '+table+' where '+query.sql+' order by '+ORDER_COLUMNS[table]).iterate(...query.args)){
   const text=canonicalRow(row);hash.update(text);bytes+=Buffer.byteLength(text);counts[table]++;
  }
 }return {digest:hash.digest('hex'),counts,bytes};
}
export function previewCleanup(db:Database.Database,range:DateRange,now=Date.now(),fixedCutoff?:number):CleanupPreview{
 const cutoff=Math.min(fixedCutoff??now-48*3600000,now-48*3600000);
 const latest=(db.prepare('select date from snapshots order by date desc limit 1').get() as {date:string}|undefined)?.date;
 const query=rangeQuery('snapshots',range);
 const rows=db.prepare('select date,generated_at from snapshots where '+query.sql+' order by date').all(...query.args) as {date:string;generated_at:string}[];
 const eligibleDates=rows.filter(row=>row.date!==latest&&Number.isFinite(Date.parse(row.generated_at))&&Date.parse(row.generated_at)<cutoff).map(row=>row.date);
 const selected=new Set(eligibleDates),hash=createHash('sha256'),counts={} as Record<BusinessTable,number>;let estimatedBytes=0;
 for(const table of BUSINESS_TABLES){
  counts[table]=0;hash.update(table+'\n');
  const q=rangeQuery(table,range);
  for(const row of db.prepare('select * from '+table+' where '+q.sql+' order by '+ORDER_COLUMNS[table]).iterate(...q.args) as Iterable<Record<string,unknown>>){
   if(table!=='daily_reports'&&!selected.has(String(row[DATE_COLUMNS[table]])))continue;
   const line=canonicalRow(row);hash.update(line);estimatedBytes+=Buffer.byteLength(line);counts[table]++;
  }
 }
 // Only the coverage fields need to leave SQLite. Historical reports can carry several large WebPs.
 const windows=db.prepare(`
  with reports(document) as (
   select case when json_valid(payload) then payload else '{}' end from daily_reports
  )
  select case json_type(document,'$.windowStart') when 'text' then json_extract(document,'$.windowStart') end as start,
         case json_type(document,'$.windowEnd') when 'text' then json_extract(document,'$.windowEnd') end as end
  from reports
 `).all() as {start:string|null;end:string|null}[];
 const missing=new Set<string>();
 for(const day of eligibleDates)if(!windows.some(win=>win.start!==null&&win.end!==null&&win.start<=day&&win.end>=day))missing.add(day.slice(0,10));
 return {range,cutoff,digest:hash.digest('hex'),counts,eligibleDates,protected:rows.length-eligibleDates.length,dailyKept:windows.length,daysWithoutReports:[...missing],estimatedBytes};
}

