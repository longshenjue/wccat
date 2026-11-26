import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,snapshot,report} from './helpers/data-fixtures';

test('hourly precomputation persists actual comments for display without modifying the source snapshot',async()=>{
 const ctx=await testDatabase(),previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='fixture-only';
 try{
  const {precomputeCommentExamples}=await import('../src/lib/comments/runtime');
  const snap=snapshot('2026-11-25-12'),topic=snap.topics[0];
  topic.occurrences[0]={...topic.occurrences[0],sourceId:'qq-news',sourceName:'腾讯新闻',url:'https://new.qq.com/rain/a/20261125A04GH900'};
  ctx.saveSnapshotToDb(snap);ctx.saveTopicAnalysisToDb(snap.date,topic.id,report('2026-11-25').topics[0].aiAnalysis!);
  let requests=0;globalThis.fetch=async(url)=>{requests++;return String(url).startsWith('https://r.inews.qq.com/')?Response.json({ret:0,comments:{new:[{reply_id:'1',parentid:'1',reply_content:'需要更多证据再判断。',agree_count:12}]}}):Response.json({choices:[{message:{content:JSON.stringify({classifications:[{id:'qq-news:1',side:'blue',confidence:.99,englishText:'We need more evidence before judging.'}]})}}]});};
  await precomputeCommentExamples(snap);
  assert.equal(ctx.readTopicAnalysesForDate(snap.date)[topic.id].commentExamples?.blue?.id,'qq-news:1');assert.equal(requests,2);
  const stored=ctx.getDb().prepare('select payload from snapshots where date=?').get(snap.date) as {payload:string};assert.deepEqual(JSON.parse(stored.payload),snap);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;ctx.close();}
});
