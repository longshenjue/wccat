import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {CommentClassifier} from '../src/lib/comments/classifier';
const sample={comments:[{id:'zhihu:1',text:'希望先看到完整证据再做判断。',sourceId:'zhihu',sourceName:'知乎',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',likes:8,rank:1,observedAt:'2026-11-24T01:00:00Z'}],runIds:['run-1']};
const battle={redLabel:'立即追责',blueLabel:'等待核实'};
test('classifier keeps exact source quote and translations, caches without a second paid call',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';const db=new Database(':memory:');let calls=0;
 try{
  const classifier=new CommentClassifier(db,{now:()=>Date.parse(sample.comments[0].observedAt),fetch:async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.match(body.messages[0].content,/untrusted/);const input=JSON.parse(body.messages[1].content);assert.deepEqual(input.battle,battle);assert.equal(input.comments[0].quoteExcerpt,sample.comments[0].text);return Response.json({choices:[{message:{content:JSON.stringify({classifications:[{id:'zhihu:1',side:'blue',confidence:.98,englishText:'I want to see the full evidence before judging.'}]})}}]});}});
  const result=await classifier.classify(sample,battle,'事件');assert.equal(result?.blue?.text,sample.comments[0].text);assert.equal(result?.blue?.likes,8);
  assert.deepEqual(await classifier.classify(sample,battle,'事件'),result);assert.equal(calls,1);assert.ok(db.prepare("select id from analysis_records where purpose='comment-selection'").get());
 }finally{db.close();if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
test('classifier failures cool down; no key never sends a request',async()=>{
 const previous=process.env.DEEPSEEK_API_KEY;const db=new Database(':memory:');let calls=0;const classifier=new CommentClassifier(db,{fetch:async()=>{calls++;return Response.json({choices:[{message:{content:'bad json'}}]});}});
 try{
  delete process.env.DEEPSEEK_API_KEY;assert.equal(await classifier.classify(sample,battle,'事件'),undefined);assert.equal(calls,0);
  process.env.DEEPSEEK_API_KEY='fixture-only';assert.equal(await classifier.classify(sample,battle,'事件'),undefined);assert.equal(await classifier.classify(sample,battle,'事件'),undefined);assert.equal(calls,1);
 }finally{db.close();if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
