import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,report} from './helpers/data-fixtures';

test('failed comment refresh preserves saved quotations and logs capture separately from display',async()=>{
 const ctx=await testDatabase(),previousKey=process.env.DEEPSEEK_API_KEY,previousFetch=globalThis.fetch;
 process.env.DEEPSEEK_API_KEY='fixture-only';
 try{
  const {enrichTopicComments}=await import('../src/lib/comments/runtime');
  const analysis=report('2026-11-25').topics[0].aiAnalysis!;
  analysis.commentExamples={redLabel:analysis.battle.redLabel,blueLabel:analysis.battle.blueLabel,sampleCount:1,sampledAt:'2026-11-25T00:00:00Z',runIds:['saved-run'],blue:{id:'zhihu:1',sourceId:'zhihu',sourceName:'知乎',text:'需要更多证据再判断。',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',rank:1,observedAt:'2026-11-25T00:00:00Z'}};
  globalThis.fetch=async()=>new Response('unavailable',{status:403});
  const messages:string[]=[];
  const result=await enrichTopicComments({title:'已保存话题',occurrences:[{sourceId:'qq-news',url:'https://new.qq.com/rain/a/20261125A04GH900'}]},analysis,(_level,message)=>messages.push(message));
  assert.deepEqual(result.commentExamples,analysis.commentExamples);
  assert.ok(messages.some(message=>message.includes('403')));
  assert.ok(messages.some(message=>message.includes('本轮取得 0 条；可展示中文 1 条、英文 0 条')&&message.includes('沿用')));
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;ctx.close();}
});
