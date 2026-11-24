import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {report as fixture,snapshot} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {readShareEnDraft,completeShareEnDraft,shareEnRepairs,shareEnSupportedTopicIds} from '../src/lib/shareen-draft';
import {generateShareEn,sourceFingerprint,validateShareEn} from '../src/lib/shareen';
import {ShareEnPoster} from '../src/components/shareen-poster';
import {shareEnTextFiles} from '../src/lib/share-export';
import {updateShareEnTop3} from '../src/lib/client-share-draft';
import {summarizeTopic} from '../src/lib/summary';
import {buildFallbackTopicAnalysis} from '../src/lib/topic-analysis';

function source(count=10){
 const report=fixture('2026-11-24');delete report.shareEnglish;
 report.topics=Array.from({length:count},(_,i)=>({...structuredClone(report.topics[0]),id:`story-${i+1}`,rank:i+1,title:i===0?'手机电池升级':`生活话题${i+1}`,categories:i===0?['tech']:['social']}));
 return report;
}
function raw(report:ReturnType<typeof source>,ids=['story-1','story-2','story-3']){
 return {layout:'editorial',topics:Object.fromEntries(report.topics.map(t=>[t.id,{title:`Saved story ${t.rank}`,hook:`The detail behind story ${t.rank}`,whatHappened:'The saved report describes a concrete development and its immediate setting.',whyItMatters:'This context helps readers understand the specific development.',battle:{redLabel:'Demand accountability',blueLabel:'Wait for evidence',redRationale:'Critics want a clear explanation.',blueRationale:'Others want to verify the report.',redScore:80,blueScore:20},column:'voices'}])),highlightIds:ids,
  posts:[{id:'observation',template:'specific_observation',text:'A small detail connects these stories to everyday life.',reason:'Specific observation'},{id:'context',template:'culture_translation',text:'The context behind three stories from the Chinese internet.',reason:'Cultural context'}],selectedPostId:'observation'};
}
function assembled(report=source(),ids?:string[]){
 return {...completeShareEnDraft(readShareEnDraft(raw(report,ids),report),report),version:1 as const,generatedAt:report.generatedAt,model:'fixture',sourceFingerprint:sourceFingerprint(report)};
}

test('editorial daily packages keep the original Top10 while exporting a hook-first four-card edition',()=>{
 const report=source(),copy=assembled(report);
 assert.equal(copy.layout,'editorial');assert.equal(copy.highlights.length+1,4);
 assert.deepEqual(copy.overview.topics.map(t=>t.id),['story-1','story-2','story-3','story-4','story-5','story-6','story-7','story-8','story-9','story-10']);
 assert.deepEqual(copy.highlights.map(h=>h.column),['tech','inside','inside']);
 assert.equal(copy.altTexts.length,4);
 for(const post of copy.posts){assert.ok(!post.text.startsWith('WcCAT'));assert.match(post.text,/WcCAT[^\n]*source/i);}
 assert.deepEqual(validateShareEn(copy,report),copy);
 assert.ok(validateShareEn(updateShareEnTop3(copy,1,'Edited selected story'),report));
 const first=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:0}));
 assert.match(first,/China Tech, in Context/);assert.match(first,/Inside China(?:&#x27;|')s Internet/);
 assert.match(first,/The detail behind story 3/);assert.doesNotMatch(first,/Saved story 10|ORIGINAL DAILY RANKING/);
 const files=shareEnTextFiles(report,copy),sources=files.find(f=>f.name==='sources.txt')!;
 assert.match(new TextDecoder().decode(sources.data),/Original rank #10: 生活话题10/);
});

test('editorial selection asks for three supported stories and never pads headline-only sources',()=>{
 const report=source();
 assert.ok(shareEnRepairs(readShareEnDraft(raw(report,['story-1','story-2']),report),report).some(r=>r.required&&r.field==='highlightIds'));
 const sparse=source();for(const topic of sparse.topics.slice(2)){topic.oneLine=topic.title;topic.whyItMatters='';delete topic.aiAnalysis;}
 const copy=assembled(sparse,['story-1','story-2']);
 assert.equal(copy.highlights.length+1,3);assert.deepEqual(copy.highlights.map(h=>h.topicId),['story-1','story-2']);
 assert.throws(()=>completeShareEnDraft(readShareEnDraft(raw(sparse,['story-1','story-2','story-3']),sparse),sparse),/selection|highlightIds/i);
});

test('voices columns require saved usable translated comments and retain source emotion scores',()=>{
 const report=source(),withoutQuotes=assembled(report);
 assert.throws(()=>validateShareEn({...withoutQuotes,highlights:withoutQuotes.highlights.map((h,i)=>i===1?{...h,column:'voices'}:h)},report),/column|comment/i);
 const topic=report.topics[1],analysis=topic.aiAnalysis!;
 analysis.commentExamples={redLabel:analysis.battle.redLabel,blueLabel:analysis.battle.blueLabel,sampleCount:1,sampledAt:'2026-11-24T00:00:00Z',runIds:['saved-run'],red:{id:'real-comment',text:'先把这件事解释清楚。',englishText:'Explain what happened first.',sourceId:'ithome',sourceName:'IT之家',articleUrl:'https://m.ithome.com/html/1030120.htm',url:'https://m.ithome.com/html/1030120.htm#comment-real',rank:1,likes:7,observedAt:'2026-11-24T00:00:00Z'}};
 const copy=assembled(report);assert.equal(copy.highlights[1].column,'voices');
 assert.deepEqual([copy.highlights[1].battle?.redScore,copy.highlights[1].battle?.blueScore],[40,60]);
 const detail=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:2}));
 assert.match(detail,/In Their Words/);assert.match(detail,/Explain what happened first/);assert.match(detail,/not a poll/i);assert.match(detail,/AI/i);
 assert.doesNotMatch(detail,/sampled at|sample time|2026-11-24T00:00:00Z/i);
 const untranslatedBattle=raw(report);delete (untranslatedBattle.topics['story-2'] as Partial<typeof untranslatedBattle.topics[string]>).battle;
 const withoutVisibleQuotes=completeShareEnDraft(readShareEnDraft(untranslatedBattle,report),report);
 assert.equal(withoutVisibleQuotes.highlights[1].column,'inside');
 delete analysis.commentExamples.red!.englishText;
 assert.equal(assembled(report).highlights[1].column,'inside');
});

test('legacy saved editions retain their branded captions, ranking opener and optional field shape',async()=>{
 const report=source(2),copy=await savedShareEnFixture(report),checked=validateShareEn(copy,report);
 assert.deepEqual(checked,copy);assert.equal(checked.layout,undefined);assert.equal(checked.highlights[0].column,undefined);
 assert.ok(checked.posts.every(p=>p.text.startsWith('WcCAT Daily Hot\n')));
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:0}));assert.match(markup,/ORIGINAL DAILY RANKING/);
});

test('new generation repairs a short editorial selection without rewriting valid hooks',async()=>{
 const report=source(),initial=raw(report,['story-1','story-2']);
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';let calls=0;
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(++calls===1?initial:{highlightIds:['story-1','story-2','story-3'],topics:{'story-3':initial.topics['story-3']}})}}]});
 try{const copy=await generateShareEn(report);assert.ok(copy);assert.equal(calls,2);assert.equal(copy.layout,'editorial');assert.equal(copy.highlights.length,3);assert.ok(copy.posts[0].text.startsWith(initial.posts[0].text));}
 finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});

test('editorial candidates use different supported patterns when the model repeats one',()=>{
 const report=source(),draft=raw(report);
 draft.posts[1].template='specific_observation';
 const copy=completeShareEnDraft(readShareEnDraft(draft,report),report);
 assert.equal(copy.posts.length,2);assert.equal(new Set(copy.posts.map(p=>p.template)).size,2);
 assert.ok(copy.posts[0].text.startsWith(draft.posts[0].text));
 const saved={...copy,version:1 as const,generatedAt:report.generatedAt,model:'fixture',sourceFingerprint:sourceFingerprint(report)};
 assert.throws(()=>validateShareEn({...saved,posts:saved.posts.map(p=>({...p,template:'specific_observation'}))},report),/pattern/i);
});

test('generation supplies source-owned editorial count and columns alongside exact saved facts',async()=>{
 const report=source(),previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';
 let supplied:Record<string,unknown>|undefined;
 globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body));supplied=JSON.parse(request.messages[1].content);
  return Response.json({choices:[{message:{content:JSON.stringify(raw(report))}}]});
 };
 try{
  assert.ok(await generateShareEn(report));
  assert.deepEqual(supplied?.editorial,{layout:'editorial',highlightCount:3,supportedTopicIds:['story-1','story-2','story-3','story-4','story-5','story-6','story-7','story-8','story-9','story-10']});
  const topics=supplied?.topics as Array<{id:string;links:unknown;column:string}>;
  assert.equal(topics[0].column,'tech');assert.equal(topics[1].column,'inside');assert.deepEqual(topics[0].links,report.topics[0].links);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});

test('generation owns editorial layout when a legacy-shaped model response omits its flag',async()=>{
 const report=source(),draft=raw(report);delete (draft as Partial<typeof draft>).layout;
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(draft)}}]});
 try{
  const copy=await generateShareEn(report);assert.ok(copy);assert.equal(copy.layout,'editorial');assert.equal(copy.highlights.length+1,4);
  assert.ok(copy.posts.every(p=>!p.text.startsWith('WcCAT Daily Hot')));
  const opener=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:0}));assert.doesNotMatch(opener,/Saved story 10|ORIGINAL DAILY RANKING/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});

test('headline-only daily material skips paid generation instead of requesting padded cards',async()=>{
 const report=source(2);for(const topic of report.topics){topic.oneLine=topic.title;topic.whyItMatters='';delete topic.aiAnalysis;}
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'{}'}}]});};
 try{assert.equal(await generateShareEn(report),undefined);assert.equal(calls,0);}
 finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});

function locallySummarizedReport(localAnalysis=false){
 const report=source(3);
 for(const daily of report.topics){
  const topic=snapshot('2026-11-24-10').topics[0];topic.id=daily.id;topic.title=daily.title;
  topic.occurrences=[{...topic.occurrences[0],title:topic.title,sourceName:'腾讯新闻'},{...topic.occurrences[0],title:topic.title,sourceId:'thepaper',sourceName:'澎湃新闻'}];
  topic.summary=summarizeTopic(topic.title,topic.occurrences);
  daily.oneLine=topic.summary.oneLine;daily.whyItMatters=topic.summary.whyItMatters;
  daily.aiAnalysis=localAnalysis?buildFallbackTopicAnalysis(topic):undefined;
 }
 return report;
}
test('actual summarizeTopic fallbacks cannot pad a four-card edition or trigger paid generation',async()=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='fixture-only';let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({choices:[{message:{content:'{}'}}]});};
 try{
  for(const localAnalysis of [false,true]){
   const report=locallySummarizedReport(localAnalysis);
   assert.deepEqual(shareEnSupportedTopicIds(report),[]);
   assert.equal(await generateShareEn(report),undefined);
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});
test('real saved descriptions or AI facts support only their own story cards amid local fallbacks',()=>{
 const report=locallySummarizedReport(true);
 report.topics[0].oneLine='报道公布了新款手机的具体电池升级安排。';
 report.topics[1].aiAnalysis!.model='deepseek-test';report.topics[1].aiAnalysis!.detailedContent='报道说明了社区服务调整的实施范围和具体条件。';
 assert.deepEqual(shareEnSupportedTopicIds(report),['story-1','story-2']);
 assert.equal(assembled(report,['story-1','story-2']).highlights.length+1,3);
 assert.throws(()=>completeShareEnDraft(readShareEnDraft(raw(report),report),report),/selection|highlightIds/i);
 const context=locallySummarizedReport(true);context.topics[0].whyItMatters='原报道说明了社区服务的具体调整内容与适用条件。';
 assert.deepEqual(shareEnSupportedTopicIds(context),['story-1'],'real original context survives even when a local analysis has generic outsider context');
});
