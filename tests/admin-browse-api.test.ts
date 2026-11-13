import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,testDatabase} from './helpers/data-fixtures';
test('history and trend endpoints require admin sessions and remain read-only',async()=>{
 const db=await testDatabase();
 const oldHash=process.env.WCCAT_ADMIN_PASSWORD_HASH,oldSecret=process.env.WCCAT_ADMIN_SESSION_SECRET,oldFetch=globalThis.fetch;
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('History queries must not fetch or call AI');};
 try {
  const auth=await import('../src/lib/admin-auth');
  process.env.WCCAT_ADMIN_PASSWORD_HASH=auth.hashAdminPassword('test-history-admin-password');
  process.env.WCCAT_ADMIN_SESSION_SECRET='test-history-session-secret-32-or-more';
  const {GET}=await import('../src/app/api/admin/browse/route');
  const base='https://example.test/api/admin/browse';
  for(const view of ['hourly','daily','detail','trend'])assert.equal((await GET(new Request(base+'?view='+view))).status,401);
  const headers={cookie:'wccat_admin='+auth.createAdminSession()};
  db.saveSnapshotToDb(snapshot('2025-09-01-08'));
  const response=await GET(new Request(base+'?view=hourly&date=2025-09-01',{headers}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const body=await response.json();
  assert.equal(body.items.length,1);
  assert.doesNotMatch(JSON.stringify(body),new RegExp(db.dir.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal((await GET(new Request(base+'?view=hourly&date=2025-02-30',{headers}))).status,400);
  assert.equal((await GET(new Request(base+'?view=hourly&date=2025-09-01&page=-1',{headers}))).status,400);
  assert.equal((await GET(new Request(base+'?view=detail&snapshot=2025-09-01-08&version=old&key=t:1',{headers}))).status,409);
  assert.equal(calls,0);
  assert.equal((db.getDb().prepare('select count(*) as n from snapshots').get() as {n:number}).n,1);
 } finally {
  globalThis.fetch=oldFetch;
  if(oldHash===undefined)delete process.env.WCCAT_ADMIN_PASSWORD_HASH;else process.env.WCCAT_ADMIN_PASSWORD_HASH=oldHash;
  if(oldSecret===undefined)delete process.env.WCCAT_ADMIN_SESSION_SECRET;else process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;
  db.close();
 }
});
