import test from 'node:test';
import assert from 'node:assert/strict';
import {report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('late topic-share generation cannot overwrite edits, source changes or a maintenance generation',async()=>{
 const ctx=await testDatabase(),previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-only-key';
 try{
  const service=await import('../src/lib/topic-sharing/service');
  const maintenance=await import('../src/lib/maintenance');
  const original=report('2026-11-24');ctx.saveDailyReportToDb(original);
  const ref={kind:'daily' as const,date:original.reportDate,topicId:original.topics[0].id};
  const source=service.loadTopicShareSource(ref),copy=topicShareCopy(source),first=service.persistTopicShare(source,copy,'none');
  let calls=0;
  const cached=await service.generateSavedTopicShare(ref,{research:async source=>source,fetch:async()=>{calls++;throw Error('must not call AI for cache');}});assert.equal(cached.revision,first.revision);assert.equal(calls,0);
  const beforeRepair=service.readTopicShare(first.id);let repairCalls=0;
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:first.revision,fetch:async()=>{
   repairCalls++;
   return new Response('provider unavailable',{status:503});
  }}),/HTTP 503/i);
  assert.equal(repairCalls,1);assert.deepEqual(service.readTopicShare(first.id),beforeRepair,'a failed provider request must preserve the exact saved draft and revision');
  let structureCalls=0;
  const invalidStructure=()=>Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:{...copy.en,article:{title:'Original article',body_zh:'A wrongly named English body.'}},zh:copy.zh})}}]});
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:first.revision,fetch:async()=>{
   structureCalls++;return invalidStructure();
  }}),/en\.article\.body_zh/);
  assert.equal(structureCalls,2);
  assert.deepEqual(service.readTopicShare(first.id),beforeRepair,'an exhausted structure recovery must preserve the exact saved draft and revision');
  const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({column:'inside',en:copy.en,zh:copy.zh})}}]});
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:first.revision,fetch:async()=>{
   service.saveTopicShareEdits(first.id,{...copy,en:{...copy.en,headline:'Newer manual edit'}},first.revision);return response();
  }}),/版本|更新/);
  const edited=service.readTopicShare(first.id)!;assert.equal(edited.copy.en.headline,'Newer manual edit');
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:edited.revision,fetch:async()=>{
   ctx.saveDailyReportToDb({...original,topics:[{...original.topics[0],oneLine:'source changed while generating',aiAnalysis:{...original.topics[0].aiAnalysis!,detailedContent:'The saved source was revised.'}}]});return response();
  }}),/来源内容.*更新/);
  assert.equal(service.readTopicShare(first.id)!.revision,edited.revision);
  ctx.saveDailyReportToDb(original);
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:edited.revision,fetch:async()=>{
   maintenance.acquireMaintenance(ctx.getDb(),'topic-test');maintenance.advanceGeneration(ctx.getDb(),'topic-test');maintenance.releaseMaintenance(ctx.getDb(),'topic-test');return response();
  }}),/数据版本/);
  assert.equal(service.readTopicShare(first.id)!.revision,edited.revision);
  // Warning-only drafts must still pass through the same final optimistic write.
  let candidateCalls=0;
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:edited.revision,fetch:async()=>{
   candidateCalls++;
   service.saveTopicShareEdits(first.id,{...edited.copy,en:{...edited.copy.en,headline:'Latest manual save'}},edited.revision);
   return Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:{...copy.en,posts:copy.en.posts.map((post,i)=>i===2?{...post,text:'One scene explains this local story.'}:post)},zh:copy.zh})}}]});
  }}),/版本|更新/);
  assert.equal(candidateCalls,1);
  assert.equal(service.readTopicShare(first.id)!.copy.en.headline,'Latest manual save');
  const latest=service.readTopicShare(first.id)!;let recoveryCalls=0;
  await assert.rejects(service.generateSavedTopicShare(ref,{research:async source=>source,force:true,expectedRevision:latest.revision,fetch:async()=>{
   recoveryCalls++;
   if(recoveryCalls===1)return invalidStructure();
   service.saveTopicShareEdits(first.id,{...latest.copy,en:{...latest.copy.en,headline:'Edited during structure recovery'}},latest.revision);
   return response();
  }}),/版本|更新/);
  assert.equal(recoveryCalls,2);
  assert.equal(service.readTopicShare(first.id)!.copy.en.headline,'Edited during structure recovery');
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;ctx.close();}
});
