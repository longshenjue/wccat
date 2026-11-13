import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';
test('persistent background export requires download acknowledgement and rejects incompatible cleanup',async()=>{
 const ctx=await testDatabase();
 try{
  const {createJob,getJob,markDownloaded}=await import('../src/lib/admin-jobs');
  ctx.saveSnapshotToDb(snapshot('2025-09-01-08'));ctx.saveSnapshotToDb(snapshot('2025-10-01-08'));ctx.saveDailyReportToDb(report('2025-09-01'));
  const wait=async(id:string)=>{
   for(let n=0;n<200;n++){
    const job=getJob(id);if(!['queued','running'].includes(job.status))return job;
    await new Promise(resolve=>setTimeout(resolve,30));
   }throw new Error('Job timed out');
  };
  const previewJob=await wait(createJob({kind:'preview',range:{start:'2025-09-01',end:'2025-09-30'}}).id);
  assert.equal(previewJob.status,'complete',previewJob.error??undefined);
  const previewId=previewJob.result.previewId as string;
  const exported=await wait(createJob({kind:'export',range:{start:'2025-09-01',end:'2025-09-30'},mode:'full',previewId}).id);
  assert.equal(exported.status,'ready',exported.error??undefined);
  assert.ok(ctx.readSnapshotFromDb('2025-09-01-08'));
  assert.throws(()=>createJob({kind:'cleanup',previewId,exportJobId:exported.id,ackDownloaded:true,ackMissingReports:true}),/下载/);
  for(const file of exported.result.files!)markDownloaded(exported.id,file.id);
  assert.throws(()=>createJob({kind:'cleanup',previewId,exportJobId:exported.id,ackDownloaded:false,ackMissingReports:true}),/确认/);
  const cleared=await wait(createJob({kind:'cleanup',previewId,exportJobId:exported.id,ackDownloaded:true,ackMissingReports:true}).id);
  assert.equal(cleared.status,'complete',cleared.error??undefined);
  assert.equal(ctx.readSnapshotFromDb('2025-09-01-08'),null);
  assert.ok(ctx.readDailyReportFromDb('2025-09-01'));
  assert.ok(ctx.readSnapshotFromDb('2025-10-01-08'));
 }finally{ctx.close();}
});

