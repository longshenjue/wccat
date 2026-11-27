import test from 'node:test';
import assert from 'node:assert/strict';
import {report,testDatabase} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';

test('warning-bearing generation, edits and legacy reads preserve content and recompute admin diagnostics',async()=>{
 const ctx=await testDatabase(),previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='warning-policy-test-key';
 try{
  const service=await import('../src/lib/topic-sharing/service');ctx.saveDailyReportToDb(report('2026-11-24'));
  const ref={kind:'daily' as const,date:'2026-11-24',topicId:'topic-one'},source=service.loadTopicShareSource(ref),baseline=topicShareCopy(source);
  const copy=structuredClone(baseline);copy.en.summary='One astronaut recited 登鹳雀楼.';copy.en.context='The comments show support from 999 million people.';
  let calls=0;
  const generated=await service.generateSavedTopicShare(ref,{research:async source=>source,fetch:async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:copy.en,zh:copy.zh})}}]});}});
  assert.equal(calls,1);assert.equal(generated.copy.en.summary,copy.en.summary);assert.ok(generated.reviewWarnings?.some(item=>item.code==='numerical'));
  const edited=service.saveTopicShareEdits(generated.id,{...generated.copy,en:{...generated.copy.en,summary:'人工确认保留中文名称的英文意译。'}},generated.revision);
  assert.equal(edited.copy.en.summary,'人工确认保留中文名称的英文意译。');assert.ok(edited.reviewWarnings?.some(item=>item.code==='language'));
  // Persisted/client warning arrays are not authoritative, including legacy rows.
  const tampered={...edited,reviewWarnings:[]};ctx.getDb().prepare('update topic_shares set payload=? where id=?').run(JSON.stringify(tampered),edited.id);
  const read=service.readTopicShare(edited.id)!;assert.ok(read.reviewWarnings?.length);assert.equal(read.revision,edited.revision);
  baseline.en.article={title:'The local discussion',body:'The discussion has a documented local setting.'};baseline.zh.article={title:'这场本地讨论',body:'这场讨论有具体的本地语境。'};
  const clear=service.saveTopicShareEdits(read.id,{...baseline,sourceFingerprint:read.source.fingerprint},read.revision);
  assert.equal(clear.reviewWarnings?.length,0);assert.equal(calls,1,'manual review never invokes AI');
  assert.throws(()=>service.saveTopicShareEdits(clear.id,{...clear.copy,reviewWarnings:[]} as typeof clear.copy,clear.revision),/owned|unknown/i);
 }finally{if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;ctx.close();}
});
