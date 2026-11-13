import {getDb} from './db';
import {storageUsage} from './data-cleanup';
import {archiveEntries} from './archive-catalog';
export function dataSummary(){
 const db=getDb(),months=new Map<string,{month:string;snapshots:number;reports:number;analyses:number;estimatedBytes:number}>();
 const get=(month:string)=>{let row=months.get(month);if(!row){row={month,snapshots:0,reports:0,analyses:0,estimatedBytes:0};months.set(month,row);}return row;};
 for(const [table,column,key] of [['snapshots','date','snapshots'],['daily_reports','report_date','reports'],['topic_analyses','snapshot_date','analyses']] as const){
  for(const row of db.prepare('select substr('+column+',1,7) as month,count(*) as count,sum(length(cast(payload as blob))) as bytes from '+table+' group by month').all() as {month:string;count:number;bytes:number}[]){
   const item=get(row.month);item[key]=row.count;item.estimatedBytes+=row.bytes??0;
  }
 }
 for(const row of db.prepare('select substr(snapshot_date,1,7) as month,sum(length(cast(payload as blob))) as bytes from topics group by month').all() as {month:string;bytes:number}[])get(row.month).estimatedBytes+=row.bytes??0;
 return {storage:storageUsage(),months:[...months.values()].sort((a,b)=>b.month.localeCompare(a.month)),archiveCount:archiveEntries().length};
}
export type DataSummary=ReturnType<typeof dataSummary>;

