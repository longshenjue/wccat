import test from 'node:test';
import assert from 'node:assert/strict';
import {report,snapshot} from './helpers/data-fixtures';
import {sameNewsFact} from '../src/lib/news-facts';
import {buildDailyCandidateTopics} from '../src/lib/daily-report';
import {parseDailyStoryGroups,selectDailyStories} from '../src/lib/daily-story-selection';
import {planDailyStories} from '../src/lib/daily-story-planner';

const titles=['妻子与蔡磊见面全程没说话','蔡磊回应“病情进入终末期”','神舟二十四号发射圆满成功','蔡磊已进入渐冻症终末期','“天下第一财神庙”重新开放','国内月底会暖到离谱','另一家公司的产品发布','法院公布案件判决','城市公共交通调整','手机电池升级','一项新的体育纪录','本地服务价格变化'];
function candidates(count=titles.length){
 const base=report('2026-11-26').topics[0];
 return Array.from({length:count},(_,i)=>({...structuredClone(base),id:`fact-${i+1}`,title:titles[i]??`独立消息${i+1}`,rank:i+1,dailyScore:1200-i*30}));
}

test('daily selection gives a running story one slot, retains distinct stages, and refills Top10 from the full pool',()=>{
 const pool=candidates(),before=JSON.stringify(pool),groups=[['fact-1','fact-2','fact-4']];
 assert.equal(sameNewsFact(pool[1].title,pool[3].title),false,'a response is a different fact from the earlier report');
 const selected=selectDailyStories(pool,groups);
 assert.equal(selected.length,10);assert.deepEqual(selected.map(t=>t.id),['fact-1','fact-3','fact-5','fact-6','fact-7','fact-8','fact-9','fact-10','fact-11','fact-12']);
 assert.deepEqual(selected[0].relatedDevelopments?.map(t=>t.id),['fact-2','fact-4']);
 assert.equal(selected[0].dailyScore,1200,'related developments do not inflate the leading fact score');
 assert.deepEqual(selected[0].relatedDevelopments?.map(t=>t.dailyScore),[1170,1110]);
 assert.equal(JSON.stringify(pool),before,'the original ranked facts remain unchanged');
 assert.deepEqual(selected.map(t=>t.rank),Array.from({length:10},(_,i)=>i+1));
});

test('same people, organizations, missions and dates alone do not join independent stories',()=>{
 const pool=candidates(4);pool[0].title='蔡磊回应病情';pool[1].title='蔡磊参与新药研发';pool[2].title='甲公司公布财报';pool[3].title='甲公司工厂发生事故';
 assert.equal(selectDailyStories(pool,[]).length,4);
 assert.ok(selectDailyStories(pool,[]).every(t=>!t.relatedDevelopments));
});

test('editorial groups contain only known disjoint source IDs and never source replacement content',()=>{
 const pool=candidates();assert.deepEqual(parseDailyStoryGroups({groups:[['fact-1','fact-2']]},pool),[['fact-1','fact-2']]);
 for(const groups of [[['fake','fact-1']],[['fact-1','fact-1']],[['fact-1','fact-2'],['fact-2','fact-4']],[['fact-1']],['fact-1']]){
  assert.throws(()=>parseDailyStoryGroups({groups},pool),/group|identity/i);
 }
 assert.throws(()=>parseDailyStoryGroups({},pool),/group/i);
});

test('the daily candidate builder retains below-Top10 facts for editorial refill',()=>{
 const sample=snapshot('2026-11-26-04'),base=sample.topics[0];
 sample.topics=candidates().map((t,i)=>({...structuredClone(base),id:t.id,title:t.title,rank:i+1,occurrences:[{...base.occurrences[0],title:t.title,rank:i+1}]}));
 sample.rawItems=sample.topics.flatMap(t=>t.occurrences);
 assert.equal(buildDailyCandidateTopics([sample],()=>({})).length,12);
});

test('story planning uses one bounded request, validates model IDs and falls back without blocking',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-editorial-only';let calls=0;
 const pool=candidates(80),warnings:string[]=[];
 try{
  globalThis.fetch=async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body)),input=JSON.parse(body.messages[1].content);
   assert.equal(input.candidates.length,40);assert.ok(body.max_tokens<=2500);
   assert.match(body.messages[0].content,/same person|same company/i);
   return Response.json({choices:[{message:{content:JSON.stringify({groups:[['fact-1','fact-2','fact-4']]})}}]});
  };
  const planned=await planDailyStories(pool,(_level,message)=>warnings.push(message));
  assert.equal(calls,1);assert.equal(planned.topics.length,10);assert.equal(planned.topics[0].relatedDevelopments?.length,2);assert.equal(planned.selection.mode,'semantic');
  globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'{"groups":[["made-up-id","fact-1"]]}'}}]});};
  const fallback=await planDailyStories(pool,(_level,message)=>warnings.push(message));
  assert.equal(calls,2,'no automatic retry for editorial classification');assert.equal(fallback.selection.mode,'fallback');assert.deepEqual(fallback.topics.map(t=>t.id),pool.slice(0,10).map(t=>t.id));
  assert.ok(warnings.some(message=>/归组.*(?:失败|未完成)/u.test(message)));
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
