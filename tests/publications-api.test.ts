import test from 'node:test';
import assert from 'node:assert/strict';
import {report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('publication preparation authenticates and fences revisions without accepting client-owned source payloads',async()=>{
 const ctx=await testDatabase(),oldHash=process.env.WCCAT_ADMIN_PASSWORD_HASH,oldSecret=process.env.WCCAT_ADMIN_SESSION_SECRET;
 try{
  const auth=await import('../src/lib/admin-auth');process.env.WCCAT_ADMIN_PASSWORD_HASH=auth.hashAdminPassword('publication-test-password');process.env.WCCAT_ADMIN_SESSION_SECRET='publication-test-secret-at-least-32-characters';
  const {POST}=await import('../src/app/api/admin/publications/route'),service=await import('../src/lib/topic-sharing/service'),store=await import('../src/lib/publications/store');
  const daily=report('2026-11-25');ctx.saveDailyReportToDb(daily);const source=service.loadTopicShareSource({kind:'daily',date:daily.reportDate,topicId:'topic-one'}),record=service.persistTopicShare(source,topicShareCopy(source),'none');
  const body={kind:'topic',id:record.id,expectedRevision:record.revision},cookie='wccat_admin='+auth.createAdminSession();
  const send=(value:unknown,origin='https://example.test',logged=true)=>POST(new Request('https://example.test/api/admin/publications',{method:'POST',headers:{'content-type':'application/json',origin,...(logged?{cookie}:{})},body:JSON.stringify(value)}));
  assert.equal((await send(body,undefined,false)).status,401);assert.equal((await send(body,'https://evil.test')).status,403);assert.equal(store.listPublications().length,0);
  assert.equal((await send({...body,expectedRevision:'0'.repeat(64)})).status,409);
  const response=await send({...body,payload:{private:'SHOULD_NOT_PUBLISH'}});assert.equal(response.status,200);const {publication}=await response.json();assert.match(publication.path,/^\/p\/[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(store.readPublication(publication.id)),/SHOULD_NOT_PUBLISH/);
  const {acquireMaintenance,releaseMaintenance}=await import('../src/lib/maintenance');acquireMaintenance(ctx.getDb(),'test-publication');try{assert.notEqual((await send(body)).status,200);}finally{releaseMaintenance(ctx.getDb(),'test-publication');}
 }finally{if(oldHash===undefined)delete process.env.WCCAT_ADMIN_PASSWORD_HASH;else process.env.WCCAT_ADMIN_PASSWORD_HASH=oldHash;if(oldSecret===undefined)delete process.env.WCCAT_ADMIN_SESSION_SECRET;else process.env.WCCAT_ADMIN_SESSION_SECRET=oldSecret;ctx.close();}
});
