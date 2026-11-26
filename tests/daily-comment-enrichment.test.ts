import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {enrichDailyComments,reuseDailyComments} from '../src/lib/comments/daily';

test('daily comments use all merged daily sources, including beyond the first three and without hourly analysis refs',async()=>{
 const report=fixture('2026-11-25');
 report.topics=Array.from({length:10},(_,index)=>({...structuredClone(report.topics[0]),id:`merged-${index}`,rank:index+1,analysisSnapshotDate:undefined,analysisTopicId:undefined}));
 report.topics[0].links=[{sourceId:'tieba',sourceName:'贴吧',title:'发射成功',url:'https://tieba.baidu.com/hottopic/browse/hottopic?topic_id=28370219'},{sourceId:'qq-news',sourceName:'腾讯新闻',title:'载人飞船发射成功',url:'https://new.qq.com/rain/a/20261125A04GH900'}];
 const inputs:Array<{title:string;occurrences:Array<{sourceId:string;url:string}>}>=[];
 await enrichDailyComments(report.topics,()=>{},async(topic,analysis)=>{inputs.push(topic);return analysis;},10);
 assert.equal(inputs.length,10);
 assert.deepEqual(inputs[0].occurrences,report.topics[0].links);
 assert.ok(inputs[0].occurrences.some(o=>o.sourceId==='qq-news'));
});

test('daily comment work stays bounded and explicitly reports missing attitude analysis',async()=>{
 const report=fixture('2026-11-25');report.topics=Array.from({length:10},(_,index)=>({...structuredClone(report.topics[0]),rank:index+1}));
 delete report.topics[1].aiAnalysis;let calls=0;const messages:string[]=[];
 await enrichDailyComments(report.topics,(_level,message)=>messages.push(message),async(_topic,analysis)=>{calls++;return analysis;},4);
 assert.equal(calls,3);assert.ok(messages.some(message=>message.includes('#2')&&message.includes('缺少')));
});

test('daily regeneration retains prior daily-only evidence for the same fact and stance, without crossing developments',()=>{
 const previous=fixture('2026-11-25'),current=structuredClone(previous),old=previous.topics[0].aiAnalysis!;
 previous.topics[0].title='神舟二十四号载人飞船发射成功';current.topics[0].title='神舟24发射圆满成功';
 old.commentExamples={redLabel:old.battle.redLabel,blueLabel:old.battle.blueLabel,sampleCount:1,sampledAt:'2026-11-25T00:00:00Z',runIds:['saved-run'],blue:{id:'zhihu:1',sourceId:'zhihu',sourceName:'知乎',text:'需要更多证据再判断。',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',rank:1,observedAt:'2026-11-25T00:00:00Z'}};
 reuseDailyComments(current,previous);assert.deepEqual(current.topics[0].aiAnalysis!.commentExamples,old.commentExamples);
 const changed=structuredClone(current);delete changed.topics[0].aiAnalysis!.commentExamples;changed.topics[0].title='神舟24完成交会对接';
 reuseDailyComments(changed,previous);assert.equal(changed.topics[0].aiAnalysis!.commentExamples,undefined);
 changed.topics[0].title=current.topics[0].title;changed.topics[0].aiAnalysis!.battle.blueLabel='不同含义的立场';
 reuseDailyComments(changed,previous);assert.equal(changed.topics[0].aiAnalysis!.commentExamples,undefined);
 changed.topics[0].aiAnalysis!.battle=structuredClone(old.battle);changed.windowStart='2026-11-24-02';
 reuseDailyComments(changed,previous);assert.equal(changed.topics[0].aiAnalysis!.commentExamples,undefined);
});
