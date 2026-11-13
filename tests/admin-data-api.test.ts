import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';
test('all management resources require login and same-origin deliberate mutations',async()=>{
 const ctx=await testDatabase();
 const oldHash=process.env.WCCAT_ADMIN_PASSWORD_HASH,oldSecret=process.env.WCCAT_ADMIN_SESSION_SECRET;
 try{
  const auth=await import('../src/lib/admin-auth');
  process.env.WCCAT_ADMIN_PASSWORD_HASH=auth.hashAdminPassword('test-only-admin-password');
  process.env.WCCAT_ADMIN_SESSION_SECRET='test-only-session-secret-32-or-more-characters';
  const {GET,POST}=await import('../src/app/api/admin/data/route');
  ctx.saveSnapshotToDb(snapshot('2025-09-01-08'));ctx.saveDailyReportToDb(report('2025-09-01'));
  assert.equal((await GET(new Request('https://example.test/api/admin/data'))).status,401);
  assert.equal((await GET(new Request('https://example.test/api/admin/data?download=../../etc/passwd&file=anything'))).status,401);
  const cookie='wccat_admin='+auth.createAdminSession();
  const request=(body:unknown,origin='https://example.test')=>new Request('https://example.test/api/admin/data',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await POST(request({action:'cleanup'},'https://evil.test'))).status,403);
  assert.equal((await POST(request({action:'cleanup'}))).status,400);
  assert.equal((await POST(request({action:'preview',range:{start:'2026-02-30',end:'2026-03-01'}}))).status,400);
  assert.equal((await GET(new Request('https://example.test/api/admin/data?download=../../etc/passwd&file=anything',{headers:{cookie}}))).status,400);
  const data=await GET(new Request('https://example.test/api/admin/data',{headers:{cookie}}));
  assert.equal(data.status,200);
  const payload=await data.json();
  assert.equal(payload.summary.months[0].month,'2025-09');
  assert.equal(payload.summary.months[0].snapshots,1);
  assert.equal(payload.summary.months[0].reports,1);
  assert.equal((ctx.getDb().prepare('select count(*) as n from snapshots').get() as {n:number}).n,1);
 }finally{
  if(oldHash===undefined)delete process.env.WCCAT_ADMIN_PASSWORD_HASH;else process.env.WCCAT_ADMIN_PASSWORD_HASH=oldHash;
  if(oldSecret===undefined)delete process.env.WCCAT_ADMIN_SESSION_SECRET;else process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;
  ctx.close();
 }
});
