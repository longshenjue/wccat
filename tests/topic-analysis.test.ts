import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTopicWithDeepSeek, type TopicAnalysisTrace} from '../src/lib/topic-analysis';
import {buildDemoItems} from '../src/lib/demo-data';
import {buildTopicRanking} from '../src/lib/ranking';
import {SOURCES} from '../src/lib/sources';

const topic=buildTopicRanking(buildDemoItems(SOURCES))[0];
const analysis={summary:'真实 AI 摘要',detailedContent:'依据材料生成的完整分析。',outsiderContext:'话题的文化背景。',battle:{redLabel:'支持',blueLabel:'质疑',redScore:60,blueScore:40,redRationale:'支持依据',blueRationale:'质疑依据'},platformAnalyses:[...new Map(topic.occurrences.slice(0,10).map(item=>[item.sourceId,item])).values()].map(item=>({sourceId:item.sourceId,sourceName:item.sourceName,attitude:'来源中的具体观点',stance:'neutral',confidence:70,evidence:'标题与内容依据'}))};
const valid=JSON.stringify(analysis);

function setup(t:TestContext,contents:string[],finishReason='stop') {
 const key=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='test-key';
 t.after(()=>{if(key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=key;});
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{
  const content=contents[Math.min(calls++,contents.length-1)];
  return new Response(JSON.stringify({choices:[{finish_reason:finishReason,message:{content}}]}),{status:200,headers:{'content-type':'application/json'}});
 });
 return ()=>calls;
}

test('malformed model JSON is retried and recovered analysis replaces the fallback',async t=>{
 const malformed='{"summary":"broken","platformAnalyses":[{} broken]}';
 const calls=setup(t,[malformed,valid]);
 const traces:TopicAnalysisTrace[]=[];
 const result=await analyzeTopicWithDeepSeek(topic,[],undefined,trace=>traces.push(trace));
 assert.equal(result.summary,analysis.summary);
 assert.notEqual(result.model,'local-rules');
 assert.equal(calls(),2);
 assert.equal(traces.at(-1)?.status,'ok');
 assert.match(JSON.stringify(traces[0].response),/broken/);
});
test('repeated invalid JSON stops after two attempts and retains failed content',async t=>{
 const calls=setup(t,['{"summary":']);
 const traces:TopicAnalysisTrace[]=[];
 const result=await analyzeTopicWithDeepSeek(topic,[],undefined,trace=>traces.push(trace));
 assert.equal(result.model,'local-rules');
 assert.equal(calls(),2);
 assert.equal(traces.at(-1)?.usedFallback,true);
 assert.match(JSON.stringify(traces.at(-1)?.response),/summary/);
});
test('blank content retries rather than treating whitespace as valid analysis',async t=>{
 const calls=setup(t,['   ',valid]);
 const result=await analyzeTopicWithDeepSeek(topic);
 assert.equal(result.summary,analysis.summary);
 assert.equal(calls(),2);
});
test('an empty JSON object cannot masquerade as successful AI analysis',async t=>{
 const calls=setup(t,['{}',valid]);
 const result=await analyzeTopicWithDeepSeek(topic);
 assert.equal(result.summary,analysis.summary);
 assert.equal(calls(),2);
});
test('truncated completion is never saved as successful analysis',async t=>{
 const calls=setup(t,[valid],'length');
 const traces:TopicAnalysisTrace[]=[];
 const result=await analyzeTopicWithDeepSeek(topic,[],undefined,trace=>traces.push(trace));
 assert.equal(result.model,'local-rules');
 assert.equal(calls(),2);
 assert.match(traces.at(-1)?.status??'',/truncated/);
});

for (const [name, partial] of [
 ['missing cultural context', {...analysis,outsiderContext:''}],
 ['empty battle', {...analysis,battle:{}}],
 ['invalid platform entry', {...analysis,platformAnalyses:[null]}],
 ['missing platform analysis', {...analysis,platformAnalyses:[]}],
 ['missing battle rationale', {...analysis,battle:{...analysis.battle,redRationale:''}}]
] as const) {
 test(`incomplete AI response retries: ${name}`,async t=>{
  const calls=setup(t,[JSON.stringify(partial),valid]);
  const result=await analyzeTopicWithDeepSeek(topic);
  assert.equal(result.summary,analysis.summary);
  assert.equal(calls(),2);
  assert.equal(result.platformAnalyses.length,analysis.platformAnalyses.length);
 });
}
