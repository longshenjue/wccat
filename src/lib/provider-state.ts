import type Database from 'better-sqlite3';
import {getChinaDate} from './date';
import {ensureMaintenanceSchema,guardedWrite} from './maintenance';
import {canonicalEvidence,sanitizeEvidence} from './evidence-content';

const tables=['provider_meta','provider_request_state','provider_daily_usage','provider_dispatch'];
export function ensureProviderSchema(db:Database.Database) {
 const existing=db.prepare("select name from sqlite_master where name='provider_meta'").get();
 if(existing){validateProviderSchema(db);return;}
 db.transaction(()=>db.exec(`
  create table provider_meta(id integer primary key check(id=1),version integer not null);
  insert into provider_meta values(1,1);
  create table provider_request_state(account text not null,endpoint text not null,cache_json text,observed_at integer,expires_at integer,
   blocked_until integer not null default 0,last_error text,lease_owner text,lease_until integer not null default 0,primary key(account,endpoint));
  create table provider_daily_usage(account text not null,endpoint text not null,day text not null,attempts integer not null,primary key(account,endpoint,day));
  create table provider_dispatch(account text primary key,next_at integer not null);
 `))();
}
/** Old complete backups legitimately have no provider metadata. Never initialize a readonly backup. */
export function validateProviderSchema(db:Database.Database) {
 const names=new Set((db.prepare("select name from sqlite_master where type='table'").all() as {name:string}[]).map(row=>row.name));
 if(!names.has('provider_meta'))return;
 for(const table of tables)if(!names.has(table))throw new Error('完整备份缺少 provider 数据表：'+table);
 const row=db.prepare('select version from provider_meta where id=1').get() as {version:number}|undefined;
 if(row?.version!==1)throw new Error('provider schema 版本不兼容');
}
type StateRow={cache_json:string|null;observed_at:number|null;expires_at:number|null;blocked_until:number;last_error:string|null;lease_owner:string|null;lease_until:number};
export type Reservation={kind:'reserved'}|{kind:'wait';ms:number}|{kind:'blocked';reason:string}|{kind:'cached';payload:unknown;observedAt:number};
export class ProviderState {
 constructor(readonly db:Database.Database){ensureMaintenanceSchema(db);ensureProviderSchema(db);}
 acquire(account:string,endpoint:string,now:number,limit:number,owner:string,generation?:number):Reservation {
  return guardedWrite(this.db,()=>{
   if(!Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('无效 provider 限额或时间');
   const row=this.db.prepare('select * from provider_request_state where account=? and endpoint=?').get(account,endpoint) as StateRow|undefined;
   if(row?.cache_json&&row.observed_at!==null&&row.expires_at!==null&&row.expires_at>now)return {kind:'cached',payload:JSON.parse(row.cache_json),observedAt:row.observed_at};
   if(row&&row.blocked_until>now)return {kind:'blocked',reason:row.last_error??'cooldown'};
   if(row&&row.lease_until>now)return {kind:'wait',ms:Math.min(250,row.lease_until-now)};
   const day=getChinaDate(new Date(now));
   const usage=this.db.prepare('select attempts from provider_daily_usage where account=? and endpoint=? and day=?').get(account,endpoint,day) as {attempts:number}|undefined;
   if((usage?.attempts??0)>=limit)return {kind:'blocked',reason:'daily-limit'};
   const dispatch=this.db.prepare('select next_at from provider_dispatch where account=?').get(account) as {next_at:number}|undefined;
   if(dispatch&&dispatch.next_at>now)return {kind:'wait',ms:Math.min(1000,dispatch.next_at-now)};
   this.db.prepare('insert into provider_daily_usage values(?,?,?,1) on conflict(account,endpoint,day) do update set attempts=attempts+1').run(account,endpoint,day);
   this.db.prepare('insert into provider_dispatch values(?,?) on conflict(account) do update set next_at=excluded.next_at').run(account,now+1000);
   this.db.prepare(`insert into provider_request_state(account,endpoint,lease_owner,lease_until) values(?,?,?,?)
    on conflict(account,endpoint) do update set lease_owner=excluded.lease_owner,lease_until=excluded.lease_until`).run(account,endpoint,owner,now+30000);
   return {kind:'reserved'};
  },generation);
 }
 complete(account:string,endpoint:string,owner:string,observedAt:number,payload:unknown,expiresAt:number,generation?:number) {
  const json=canonicalEvidence(sanitizeEvidence(payload));
  if(Buffer.byteLength(json)>2*1024*1024)throw new Error('provider cache 超过保存上限');
  return guardedWrite(this.db,()=>this.db.prepare(`update provider_request_state set cache_json=?,observed_at=?,expires_at=?,blocked_until=0,last_error=null,lease_owner=null,lease_until=0
   where account=? and endpoint=? and lease_owner=?`).run(json,observedAt,expiresAt,account,endpoint,owner).changes===1,generation);
 }
 fail(account:string,endpoint:string,owner:string,blockedUntil:number,error:string,generation?:number) {
  return guardedWrite(this.db,()=>this.db.prepare(`update provider_request_state set blocked_until=?,last_error=?,lease_owner=null,lease_until=0
   where account=? and endpoint=? and lease_owner=?`).run(blockedUntil,String(sanitizeEvidence(error)).slice(0,500),account,endpoint,owner).changes===1,generation);
 }
 status(account:string) {
  return {usage:this.db.prepare('select endpoint,day,attempts from provider_daily_usage where account=? order by day,endpoint').all(account) as {endpoint:string;day:string;attempts:number}[],
   endpoints:this.db.prepare('select endpoint,observed_at,expires_at,blocked_until,last_error from provider_request_state where account=? order by endpoint').all(account)};
 }
}
