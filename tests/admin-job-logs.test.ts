import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/data-fixtures';

test('task logs redact secrets, survive reads and keep per-task and total storage bounded', async () => {
 const db = await testDatabase();
 const oldSecret = process.env.WCCAT_ADMIN_SESSION_SECRET;
 process.env.WCCAT_ADMIN_SESSION_SECRET = 'private-session-secret-test-value';
 try {
  const logs = await import('../src/lib/admin-job-logs');
  const id = randomUUID();
  db.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'daily','complete','{}',?,?)").run(id,Date.now(),Date.now());
  logs.appendJobLog(id,'warn','Failed with '+process.env.WCCAT_ADMIN_SESSION_SECRET+' Authorization: Bearer sk-private-provider-key');
  const first = logs.readJobLogs(id);
  assert.equal(first.entries.length,1);
  assert.equal(first.entries[0].level,'warn');
  assert.doesNotMatch(first.entries[0].message,/private-session-secret|sk-private-provider-key/);
  assert.match(first.entries[0].message,/REDACTED/);
  for(let i=0;i<160;i++) logs.appendJobLog(id,'info',`${i}: `+'猫'.repeat(1200));
  const bounded = logs.readJobLogs(id);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded.entries))<=256*1024);
  assert.equal(bounded.truncated,true);
  assert.match(bounded.entries.at(-1)!.message,/159:/);
  assert.doesNotMatch(bounded.entries.at(-1)!.message,/\uFFFD/);
  assert.throws(()=>logs.readJobLogs('../anything'),/任务/);

  const insert=db.getDb().prepare('insert into admin_job_logs(job_id,payload,truncated,updated_at) values(?,?,0,?)');
  const oldId=randomUUID();
  db.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'daily','complete','{}',0,0)").run(oldId);
  insert.run(oldId,JSON.stringify([{at:1,level:'info',message:'old log'}]),Date.now()-31*86400000);
  logs.pruneJobLogs();
  assert.equal(logs.readJobLogs(oldId).entries.length,0);
  assert.ok(db.getDb().prepare('select id from admin_jobs where id=?').get(oldId));
  for(let i=0;i<85;i++) {
   const key=randomUUID();
   db.getDb().prepare("insert into admin_jobs(id,kind,status,input,created_at,updated_at) values(?,'daily','complete','{}',0,0)").run(key);
   insert.run(key,' '.repeat(256*1024),Date.now()-1000+i);
  }
  logs.pruneJobLogs();
  const total=db.getDb().prepare('select sum(length(cast(payload as blob))) as bytes from admin_job_logs').get() as {bytes:number};
  assert.ok(total.bytes<=20*1024*1024);
 } finally {
  if(oldSecret===undefined)delete process.env.WCCAT_ADMIN_SESSION_SECRET;else process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;
  db.close();
 }
});
