import test from 'node:test';
import assert from 'node:assert/strict';
import {report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';

test('explicit saved-topic generation researches once, freezes the new evidence and reuses it without mutating daily input',async()=>{
 const ctx=await testDatabase(),oldKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-service-news';
 try{
  const service=await import('../src/lib/topic-sharing/service');const {withTopicShareResearch}=await import('../src/lib/topic-sharing/source');const daily=report('2026-11-26');ctx.saveDailyReportToDb(daily);
  const ref={kind:'daily' as const,date:daily.reportDate,topicId:daily.topics[0].id},original=service.loadTopicShareSource(ref);let research=0,writes=0;
  const options={research:async(source:TopicShareSource)=>{research++;return withTopicShareResearch(source,{policy:'news-research-v1' as const,checkedAt:'2026-11-27T00:00:00Z',status:'ready' as const,questions:[],queries:[],documents:[{id:'r-epa',title:'EPA sampling update',url:'https://www.epa.gov/newsreleases/iowa-update',publisher:'EPA',text:'EPA said environmental monitoring continues.',retrievedAt:'2026-11-27T00:00:00Z',purpose:'event' as const}],warnings:[]});},fetch:async()=>{writes++;const copy=topicShareCopy(original);for(const lang of ['en','zh'] as const)copy[lang].article={title:lang==='en'?'A researched story':'经过查询的报道',body:lang==='en'?'Monitoring continues, according to the agency.':'机构称监测仍在继续。'};return Response.json({choices:[{message:{content:JSON.stringify({en:copy.en,zh:copy.zh})}}]});}};
  const record=await service.generateSavedTopicShare(ref,options);assert.equal(research,1);assert.equal(writes,1);
  assert.equal(record.source.baseFingerprint,original.fingerprint);assert.equal(record.copy.sourceFingerprint,record.source.fingerprint);assert.equal(record.source.research?.documents[0].publisher,'EPA');assert.ok(record.copy.en.article?.body);
  assert.deepEqual(ctx.readDailyReportFromDb(daily.reportDate),daily);service.topicSharePayload(ref);assert.equal(research,1,'read and preview never start research');
  assert.equal((await service.generateSavedTopicShare(ref,options)).revision,record.revision);assert.equal(research,1);assert.equal(writes,1);
  delete process.env.DEEPSEEK_API_KEY;
  await assert.rejects(service.generateSavedTopicShare(ref,{...options,force:true,expectedRevision:record.revision}),/DEEPSEEK_API_KEY/);
  assert.equal(research,1,'missing model configuration must not start external research');assert.equal(writes,1);
 }finally{if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;ctx.close();}
});
