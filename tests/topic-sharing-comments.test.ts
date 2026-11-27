import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,report} from './helpers/data-fixtures';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import {getChinaDate} from '../src/lib/date';

test('single-topic generation captures and freezes real comments without rewriting the daily source or breaking reuse',async()=>{
 const ctx=await testDatabase(),previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='fixture-only';
 try{
  const service=await import('../src/lib/topic-sharing/service');
  const daily=report(getChinaDate()),topic=daily.topics[0];
  topic.links=[{sourceId:'qq-news',sourceName:'腾讯新闻',title:topic.title,url:'https://new.qq.com/rain/a/20261125A04GH900'}];ctx.saveDailyReportToDb(daily);
  const ref={kind:'daily' as const,date:daily.reportDate,topicId:topic.id},source=service.loadTopicShareSource(ref),copy=topicShareCopy(source);let captures=0,classifications=0,generations=0;
  globalThis.fetch=async(url)=>{
   if(String(url).startsWith('https://r.inews.qq.com/')){captures++;return Response.json({ret:0,comments:{new:[{reply_id:'1',parentid:'1',reply_content:'需要更多证据再判断。',agree_count:12}]}});}
   assert.equal(String(url),'https://api.deepseek.com/chat/completions');classifications++;
   return Response.json({choices:[{message:{content:JSON.stringify({classifications:[{id:'qq-news:1',side:'blue',confidence:.99,englishText:'We need more evidence before judging.'}]})}}]});
  };
  const options={research:async (original:typeof source)=>original,fetch:async()=>{generations++;return Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:copy.en,zh:copy.zh})}}]});}};
  const record=await service.generateSavedTopicShare(ref,options);
  assert.equal(record.source.commentExamples?.blue?.id,'qq-news:1');assert.equal(record.source.baseFingerprint,source.fingerprint);assert.notEqual(record.source.fingerprint,source.fingerprint);
  assert.equal(record.copy.sourceFingerprint,record.source.fingerprint);assert.equal(ctx.readDailyReportFromDb(daily.reportDate)!.topics[0].aiAnalysis!.commentExamples,undefined,'single-topic capture must not invalidate original daily/share versions');
  assert.equal((await service.generateSavedTopicShare(ref,options)).revision,record.revision);assert.deepEqual({captures,classifications,generations},{captures:1,classifications:1,generations:1});
  const regenerated=await service.generateSavedTopicShare(ref,{...options,force:true,expectedRevision:record.revision,expectedSourceFingerprint:record.source.fingerprint});
  assert.equal(regenerated.source.commentExamples?.blue?.id,'qq-news:1');assert.deepEqual({captures,classifications,generations},{captures:1,classifications:1,generations:2},'generation must reuse bounded network and classification caches');
  const changed=ctx.readDailyReportFromDb(daily.reportDate)!;changed.topics[0].aiAnalysis!.detailedContent='原始材料发生变化。';ctx.saveDailyReportToDb(changed);
  await assert.rejects(service.generateSavedTopicShare(ref,{...options,expectedSourceFingerprint:record.source.fingerprint}),/来源内容已更新/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;ctx.close();}
});
