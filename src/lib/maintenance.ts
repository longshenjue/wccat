import type Database from 'better-sqlite3';
import {hostname} from 'node:os';
export class MaintenanceError extends Error {}
type State={owner:string|null;pid:number|null;host:string|null;generation:number};
export function ensureMaintenanceSchema(db:Database.Database){
 db.exec(`
 create table if not exists maintenance_state(id integer primary key check(id=1),owner text,pid integer,host text,generation integer not null default 0);
 insert or ignore into maintenance_state(id) values(1);
 create table if not exists admin_jobs(id text primary key,kind text not null,status text not null,input text not null,result text,error text,progress text,pid integer,host text,created_at integer not null,updated_at integer not null,cancelled integer not null default 0);
 create table if not exists admin_previews(id text primary key,payload text not null,created_at integer not null);
 create table if not exists cleared_hours(date text primary key,cleared_at text not null);
 `);
}
export function processAlive(pid:number|null,host:string|null){
 if(!pid||host!==hostname())return false;
 try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}
}
function state(db:Database.Database):State{
 let row=db.prepare('select owner,pid,host,generation from maintenance_state where id=1').get() as State;
 if(row.owner&&!processAlive(row.pid,row.host)){
  db.prepare('update maintenance_state set owner=null,pid=null,host=null,generation=generation+1 where id=1 and owner=?').run(row.owner);
  row=db.prepare('select owner,pid,host,generation from maintenance_state where id=1').get() as State;
 }
 return row;
}
export function readGeneration(db:Database.Database){
 return db.transaction(()=>{const row=state(db);if(row.owner)throw new MaintenanceError('数据维护进行中，请稍后重试。');return row.generation;}).immediate();
}
export function guardedWrite<T>(db:Database.Database,write:()=>T,expectedGeneration?:number):T{
 return db.transaction(()=>{
  const row=state(db);if(row.owner)throw new MaintenanceError('数据维护进行中，请稍后重试。');
  if(expectedGeneration!==undefined&&row.generation!==expectedGeneration)throw new MaintenanceError('数据版本已改变，已阻止维护前的延迟写入，请重试。');
  return write();
 }).immediate();
}
export function acquireMaintenance(db:Database.Database,owner:string){
 db.transaction(()=>{const row=state(db);if(row.owner)throw new MaintenanceError('另一个数据维护任务正在运行。');
 db.prepare('update maintenance_state set owner=?,pid=?,host=? where id=1').run(owner,process.pid,hostname());}).immediate();
}
export function advanceGeneration(db:Database.Database,owner:string){
 if(db.prepare('update maintenance_state set generation=generation+1 where id=1 and owner=?').run(owner).changes!==1)throw new MaintenanceError('维护任务所有权已改变。');
}
export function releaseMaintenance(db:Database.Database,owner:string){
 db.prepare('update maintenance_state set owner=null,pid=null,host=null where id=1 and owner=?').run(owner);
}

