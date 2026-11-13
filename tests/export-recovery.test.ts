import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';
const pause=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
test('interrupted export artifacts are owned, reclaimable, and old downloads remain visible and expire',async(t)=>{
 const ctx=await testDatabase();
 try{
  const {createJob,getJob,getJobs,discardExport}=await import('../src/lib/admin-jobs');
  const {exportMonth}=await import('../src/lib/archive-export');
  const {exportsDir}=await import('../src/lib/storage-paths');
  const item=snapshot('2025-09-01-08');
  item.rawItems=Array.from({length:8000},(_,i)=>({...item.rawItems[0],rank:i+1,title:'Raw '+i,description:randomUUID().repeat(8)}));
  ctx.saveSnapshotToDb(item);ctx.saveSnapshotToDb(snapshot('2025-10-01-08'));ctx.saveDailyReportToDb(report('2025-09-01'));
  const wait=async(id:string)=>{for(let i=0;i<1000;i++){const job=getJob(id);if(!['queued','running'].includes(job.status))return job;await pause();}throw new Error('Job timed out');};
  const scan=()=>existsSync(exportsDir)?readdirSync(exportsDir,{recursive:true}).map(String):[];
  for(const phase of ['copy','compression','second-month']){
   await t.test('SIGKILL during '+phase+' cannot strand an untracked file',async()=>{
    const range={start:'2025-09-01',end:phase==='second-month'?'2025-10-31':'2025-09-30'};
    const preview=await wait(createJob({kind:'preview',range}).id);
    const previous=new Set(scan());
    const job=createJob({kind:'export',range,mode:'full',previewId:preview.result.previewId});
    let interrupted=false;
    for(let i=0;i<1500;i++){
     const files=scan().filter(file=>!previous.has(file));
     const sqlite=files.filter(file=>file.endsWith('data.sqlite'));
     const gzip=files.filter(file=>file.endsWith('.sqlite.gz'));
     const ready=phase==='copy'?sqlite.length>0&&gzip.length===0:phase==='compression'?sqlite.some(file=>gzip.some(gz=>gz.slice(0,gz.lastIndexOf('/'))===file.slice(0,file.lastIndexOf('/')))):sqlite.length>0&&gzip.length>0;
     if(ready){const current=getJob(job.id);if(current.status==='running'&&current.pid){process.kill(current.pid,'SIGKILL');interrupted=true;break;}}
     if(!['queued','running'].includes(getJob(job.id).status))break;
     await pause(2);
    }
    assert.equal(interrupted,true,'fixture must interrupt real running I/O');
    for(let i=0;i<200;i++){getJobs();if(getJob(job.id).status==='failed')break;await pause();}
    assert.equal(getJob(job.id).status,'failed');
    discardExport(job.id);
    assert.equal(scan().filter(file=>!previous.has(file)&&(/data\.sqlite|\.sqlite\.gz/.test(file))).length,0,'no abandoned SQLite/journal/gzip files');
    assert.ok(ctx.readSnapshotFromDb('2025-09-01-08'));
   });
  }
  await t.test('more than30 newer jobs cannot hide or prevent expiry of an old ready download',async()=>{
   const id=randomUUID(),range={start:'2025-09-01',end:'2025-09-30'};
   const file=await exportMonth(range,'daily',()=>{},()=>false,id);unlinkSync(file.sqlitePath);
   const old=Date.now()-48*3600000;
   ctx.getDb().prepare('insert into admin_jobs(id,kind,status,input,result,created_at,updated_at) values(?,?,?,?,?,?,?)').run(id,'export','ready',JSON.stringify({kind:'export',range,mode:'daily'}),JSON.stringify({files:[file]}),old,old);
   for(let i=0;i<31;i++)ctx.getDb().prepare('insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,?,?,?,?,?)').run(randomUUID(),'preview','complete','{}',Date.now()+i,Date.now()+i);
   assert.ok(getJobs().some(job=>job.id===id),'all retained downloads remain reachable');
   const preview=await wait(createJob({kind:'preview',range}).id);
   const next=await wait(createJob({kind:'export',range,mode:'daily',previewId:preview.result.previewId}).id);
   assert.equal(next.status,'ready',next.error??undefined);
   assert.equal(getJob(id).status,'expired');
   assert.equal(existsSync(file.path),false);
  });
 }finally{ctx.close();}
});
