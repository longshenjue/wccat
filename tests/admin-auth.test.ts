import test from 'node:test';
import assert from 'node:assert/strict';
import { hashAdminPassword, verifyAdminPassword, createAdminSession, verifyAdminSession, requireAdmin, loginAllowed, adminConfigured } from '../src/lib/admin-auth';

test('admin credentials, expiring sessions, rotation and same-origin mutations',()=>{
 const oldHash=process.env.WCCAT_ADMIN_PASSWORD_HASH;
 const oldSecret=process.env.WCCAT_ADMIN_SESSION_SECRET;
 const password='test-only-long-password';
 try{
  delete process.env.WCCAT_ADMIN_PASSWORD_HASH;
  delete process.env.WCCAT_ADMIN_SESSION_SECRET;
  assert.equal(adminConfigured(),false);
  assert.throws(()=>requireAdmin(new Request('https://example.test/api/admin/data')));
  process.env.WCCAT_ADMIN_PASSWORD_HASH=hashAdminPassword(password);
  process.env.WCCAT_ADMIN_SESSION_SECRET='test-only-session-secret-at-least-32-characters';
  assert.equal(adminConfigured(),true);
  assert.equal(verifyAdminPassword(password),true);
  assert.equal(verifyAdminPassword('incorrect-password'),false);
  const now=Date.now(), token=createAdminSession(now);
  assert.equal(verifyAdminSession(token,now),true);
  assert.equal(verifyAdminSession(token+'x',now),false);
  assert.equal(verifyAdminSession(token,now+8*3600*1000),false);
  const request=(origin:string)=>new Request('https://example.test/api/admin/data',{method:'POST',headers:{cookie:'wccat_admin='+token,origin}});
  assert.doesNotThrow(()=>requireAdmin(request('https://example.test'),true));
  assert.throws(()=>requireAdmin(request('https://evil.test'),true));
  assert.throws(()=>requireAdmin(new Request('https://example.test/api/admin/data',{method:'POST',headers:{cookie:'wccat_admin='+token}}),true));
  assert.throws(()=>requireAdmin(new Request('https://example.test/api/admin/data',{headers:{cookie:'wccat_admin=invalid'}})));
  process.env.WCCAT_ADMIN_PASSWORD_HASH=hashAdminPassword('another-test-only-password');
  assert.equal(verifyAdminSession(token,now),false);
  for(let i=0;i<5;i++)assert.equal(loginAllowed('test-ip',now),true);
  assert.equal(loginAllowed('test-ip',now),false);
  assert.equal(loginAllowed('test-ip',now+15*60*1000+1),true);
 }finally{
  if(oldHash===undefined)delete process.env.WCCAT_ADMIN_PASSWORD_HASH;else process.env.WCCAT_ADMIN_PASSWORD_HASH=oldHash;
  if(oldSecret===undefined)delete process.env.WCCAT_ADMIN_SESSION_SECRET;else process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;
 }
});

