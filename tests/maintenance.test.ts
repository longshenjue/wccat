import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir,hostname} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ensureMaintenanceSchema,guardedWrite,acquireMaintenance,releaseMaintenance,advanceGeneration,readGeneration} from '../src/lib/maintenance';

test('cross-connection maintenance fences and late child writes cannot resurrect records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wccat-fence-'));
 const file=join(dir,'test.sqlite'), a=new Database(file), b=new Database(file);
 try{
  ensureMaintenanceSchema(a);a.exec('create table records(id integer primary key)');
  const before=readGeneration(a);
  guardedWrite(a,()=>a.prepare('insert into records values(1)').run(),before);
  acquireMaintenance(a,'test-owner');
  assert.throws(()=>guardedWrite(b,()=>b.prepare('insert into records values(2)').run(),before),/维护/);
  a.prepare('delete from records').run();
  advanceGeneration(a,'test-owner');releaseMaintenance(a,'test-owner');
  assert.throws(()=>guardedWrite(b,()=>b.prepare('insert into records values(3)').run(),before),/数据版本/);
  const child=spawnSync(process.execPath,['--import',require.resolve('tsx'),'-e',`const Database=require('better-sqlite3');const m=require(${JSON.stringify(join(process.cwd(),'src/lib/maintenance.ts'))});const db=new Database(process.argv[1]);try{m.guardedWrite(db,()=>db.prepare('insert into records values(9)').run(),0);process.exitCode=1;}catch(e){console.log(e.message);}finally{db.close();}`,file],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/数据版本/);
  assert.equal((a.prepare('select count(*) as n from records').get() as {n:number}).n,0);
  a.prepare('update maintenance_state set owner=?,pid=?,host=? where id=1').run('dead',2147483647,hostname());
  assert.doesNotThrow(()=>guardedWrite(b,()=>b.prepare('insert into records values(4)').run()));
  assert.equal(readGeneration(a),2);
 }finally{b.close();a.close();rmSync(dir,{recursive:true,force:true});}
});
