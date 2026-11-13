import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/data-fixtures';
test('a development CRUD request awaiting its body cannot write after cleanup advances generation',async()=>{
 const ctx=await testDatabase(),env=process.env as Record<string,string|undefined>,previous=env.NODE_ENV;
 try{
  env.NODE_ENV='development';
  const {POST}=await import('../src/app/api/admin/db/route');
  const {acquireMaintenance,advanceGeneration,releaseMaintenance}=await import('../src/lib/maintenance');
  const request=new Request('http://localhost/api/admin/db',{method:'POST'});
  request.json=async()=>{
   acquireMaintenance(ctx.getDb(),'test-cleanup');advanceGeneration(ctx.getDb(),'test-cleanup');releaseMaintenance(ctx.getDb(),'test-cleanup');
   return {table:'daily_reports',values:{report_date:'2025-01-01',generated_at:'2025-01-01T00:00:00Z',model:'test',payload:'{}'}};
  };
  await assert.rejects(POST(request),/数据版本/);
  assert.equal((ctx.getDb().prepare('select count(*) as n from daily_reports').get() as {n:number}).n,0);
 }finally{if(previous===undefined)delete env.NODE_ENV;else env.NODE_ENV=previous;ctx.close();}
});
