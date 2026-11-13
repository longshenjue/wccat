import {getDb} from './db';
import {redactJobMessage} from './log-redaction';
export {redactJobMessage} from './log-redaction';

export type JobLogLevel = 'info' | 'warn' | 'error';
export type JobLogEntry = {at:number;level:JobLogLevel;message:string};
export type JobLogs = {entries:JobLogEntry[];truncated:boolean};
const jobLimit=256*1024, totalLimit=20*1024*1024;
const idPattern=/^[a-f0-9-]{36}$/;

function validateJob(id:string) {
 if(!idPattern.test(id)||!getDb().prepare('select id from admin_jobs where id=?').get(id)) throw new Error('任务不存在或标识无效。');
}

export function readJobLogs(id:string):JobLogs {
 validateJob(id);
 const row=getDb().prepare('select payload,truncated,updated_at from admin_job_logs where job_id=?').get(id) as {payload:string;truncated:number;updated_at:number}|undefined;
 if(!row||row.updated_at<Date.now()-30*86400000) return {entries:[],truncated:false};
 return {entries:JSON.parse(row.payload),truncated:Boolean(row.truncated)};
}

/** Only log buffers expire; task results, business data and export proofs are untouched. */
export function pruneJobLogs(now=Date.now()) {
 const db=getDb();
 db.transaction(()=>{
  db.prepare("delete from admin_job_logs where updated_at<? and job_id not in (select id from admin_jobs where status in ('queued','running'))").run(now-30*86400000);
  const rows=db.prepare('select job_id,length(cast(payload as blob)) as bytes from admin_job_logs order by updated_at desc,job_id').all() as {job_id:string;bytes:number}[];
  let used=0;
  for(const row of rows) {
   used+=row.bytes;
   if(used>totalLimit) db.prepare('delete from admin_job_logs where job_id=?').run(row.job_id);
  }
 }).immediate();
}

export function appendJobLog(id:string,level:JobLogLevel,message:string):JobLogEntry {
 validateJob(id);
 const safe=redactJobMessage(message);
 // Decode an incomplete final UTF-8 codepoint as a streaming tail, not a replacement character.
 const bytes=Buffer.from(safe);
 const entry:JobLogEntry={at:Date.now(),level,message:new TextDecoder().decode(bytes.subarray(0,2048),{stream:true})};
 const db=getDb();
 db.transaction(()=>{
  const row=db.prepare('select payload,truncated from admin_job_logs where job_id=?').get(id) as {payload:string;truncated:number}|undefined;
  const entries:JobLogEntry[]=row?JSON.parse(row.payload):[];
  entries.push(entry);
  let payload=JSON.stringify(entries),truncated=Boolean(row?.truncated)||bytes.length>2048;
  while(Buffer.byteLength(payload)>jobLimit) {entries.shift();payload=JSON.stringify(entries);truncated=true;}
  db.prepare('insert into admin_job_logs(job_id,payload,truncated,updated_at) values(?,?,?,?) on conflict(job_id) do update set payload=excluded.payload,truncated=excluded.truncated,updated_at=excluded.updated_at')
   .run(id,payload,Number(truncated),entry.at);
 }).immediate();
 pruneJobLogs();
 return entry;
}
