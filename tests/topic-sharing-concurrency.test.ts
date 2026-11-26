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
  const cached=await service.generateSavedTopicShare(ref,{fetch:async()=>{calls++;throw Error('must not call AI for cache');}});assert.equal(cached.revision,first.revision);assert.equal(calls,0);
  const beforeRepair=service.readTopicShare(first.id);let repairCalls=0;
  await assert.rejects(service.generateSavedTopicShare(ref,{force:true,expectedRevision:first.revision,fetch:async()=>{
   repairCalls++;
   return Response.json({choices:[{message:{content:JSON.stringify(repairCalls===1?{column:'inside',en:{...copy.en,context:'The comments show support.'},zh:copy.zh}:{patches:[{path:'en.context',text:'Users strongly support the plan.'}]})}}]});
  }}),/comment.*evidence/i);
  assert.equal(repairCalls,2);assert.deepEqual(service.readTopicShare(first.id),beforeRepair,'a failed repair must preserve the exact saved draft and revision');
  const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({column:'inside',en:copy.en,zh:copy.zh})}}]});
  await assert.rejects(service.generateSavedTopicShare(ref,{force:true,expectedRevision:first.revision,fetch:async()=>{
   service.saveTopicShareEdits(first.id,{...copy,en:{...copy.en,headline:'Newer manual edit'}},first.revision);return response();
  }}),/版本|更新/);
  const edited=service.readTopicShare(first.id)!;assert.equal(edited.copy.en.headline,'Newer manual edit');
  await assert.rejects(service.generateSavedTopicShare(ref,{force:true,expectedRevision:edited.revision,fetch:async()=>{
   ctx.saveDailyReportToDb({...original,topics:[{...original.topics[0],oneLine:'source changed while generating',aiAnalysis:{...original.topics[0].aiAnalysis!,detailedContent:'The saved source was revised.'}}]});return response();
  }}),/来源内容.*更新/);
  assert.equal(service.readTopicShare(first.id)!.revision,edited.revision);
  ctx.saveDailyReportToDb(original);
  await assert.rejects(service.generateSavedTopicShare(ref,{force:true,expectedRevision:edited.revision,fetch:async()=>{
   maintenance.acquireMaintenance(ctx.getDb(),'topic-test');maintenance.advanceGeneration(ctx.getDb(),'topic-test');maintenance.releaseMaintenance(ctx.getDb(),'topic-test');return response();
  }}),/数据版本/);
  assert.equal(service.readTopicShare(first.id)!.revision,edited.revision);
  // Candidate recomposition must pass through the same final optimistic write.
  let candidateCalls=0;
  await assert.rejects(service.generateSavedTopicShare(ref,{force:true,expectedRevision:edited.revision,fetch:async()=>{
   if(++candidateCalls===1)return Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:{...copy.en,posts:copy.en.posts.map((post,i)=>i===2?{...post,text:'One scene explains this local story.'}:post)},zh:copy.zh})}}]});
   service.saveTopicShareEdits(first.id,{...edited.copy,en:{...edited.copy.en,headline:'Latest manual save'}},edited.revision);
   return Response.json({choices:[{message:{content:JSON.stringify({patches:[{path:'en.posts[2].text',text:'One scene explains this local story.'}]})}}]});
  }}),/版本|更新/);
  assert.equal(candidateCalls,2);
  assert.equal(service.readTopicShare(first.id)!.copy.en.headline,'Latest manual save');
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;ctx.close();}
});
