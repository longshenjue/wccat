import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from './helpers/data-fixtures';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';
import {enrichDailyReporting} from '../src/lib/newsroom/daily-reporting';
import {shareEnEditorialSource,shareEnSupportedTopicIds} from '../src/lib/shareen-draft';
import {MaintenanceError} from '../src/lib/maintenance';

function edition(){
 const daily=report('2026-11-27');
 daily.topics=Array.from({length:12},(_,i)=>({...structuredClone(daily.topics[0]),id:'story-'+i,rank:i+1,title:'具体新闻'+i}));
 return daily;
}
function researched(source:TopicShareSource,purpose:'event'|'background'='event'):TopicShareSource {
 return {...source,research:{policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:purpose==='event'?'ready':'partial',questions:[],queries:[],warnings:[],documents:[{id:'report-'+source.topicId,url:'https://news.example.com/'+source.topicId,title:'Current source report',publisher:'News',text:'A specific dated development.',retrievedAt:'2026-11-27T09:00:00Z',publishedAt:'2026-11-27',purpose}]}};
}

test('explicit daily reporting researches a bounded shortlist and hands current source bodies to analysis without changing ranking',async()=>{
 const {enrichDailyReporting}=await import('../src/lib/newsroom/daily-reporting').catch(error=>assert.fail(`Daily reporting research is missing: ${error.message}`));
 const daily=report('2026-11-27');daily.topics=Array.from({length:10},(_,i)=>({...structuredClone(daily.topics[0]),id:'story-'+i,rank:i+1,title:'具体新闻'+i}));
 const order=daily.topics.map(topic=>topic.id),researched:string[]=[];
 await enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {research:async source=>{researched.push(source.topicId);return {...source,research:{policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:'ready',questions:[],queries:[],documents:[{id:'r-current',url:'https://www.agency.gov/news/2026-11-27/update',title:'Current announcement',publisher:'Agency',publishedAt:'2026-11-27',retrievedAt:'2026-11-27T09:00:00Z',purpose:'event',text:'A specific dated development.'}],warnings:[]}};},assets:async source=>source,analyze:async(_topic,contexts)=>{assert.match(contexts![0].text,/specific dated development/);return {...daily.topics[0].aiAnalysis!,summary:'今日的新进展',detailedContent:'11月27日发布了具体安排。'};}});
 assert.equal(researched.length,3);assert.deepEqual(daily.topics.map(topic=>topic.id),order);assert.equal(daily.topics.filter(topic=>topic.research?.documents.length).length,3);assert.equal(daily.topics.filter(topic=>topic.aiAnalysis?.summary==='今日的新进展').length,3);
});

test('background-only candidate is replaced until three stories qualify under the actual share selection rule',async()=>{
 const daily=edition(),order=daily.topics.map(topic=>topic.id),attempts:string[]=[],assets:string[]=[];
 await enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {
  research:async source=>{attempts.push(source.topicId);return researched(source,source.topicId==='story-0'?'background':'event');},
  assets:async source=>{assets.push(source.topicId);return source;},
  analyze:async()=>daily.topics[0].aiAnalysis!
 });
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),['story-1','story-2','story-3']);
 assert.deepEqual(attempts,['story-0','story-1','story-2','story-3']);
 assert.deepEqual(assets,['story-1','story-2','story-3']);
 assert.deepEqual(daily.topics.map(topic=>topic.id),order);
});

test('a retrieval exception preserves the failed candidate and continues to its replacements',async()=>{
 const daily=edition(),original=structuredClone(daily.topics[0]),logs:string[]=[];
 await enrichDailyReporting(daily.topics,daily.reportDate,(_level,message)=>logs.push(message),{
  research:async source=>{if(source.topicId==='story-0')throw new Error('provider unavailable');return researched(source);},
  assets:async source=>source,analyze:async()=>daily.topics[0].aiAnalysis!
 });
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),['story-1','story-2','story-3']);
 assert.deepEqual(daily.topics[0],original);
 assert.ok(logs.some(message=>message.includes('#1')&&message.includes('候补')));
});

test('unavailable current reporting exhausts only the Top10 and explains the shortfall without padding',async()=>{
 const daily=edition(),attempts:string[]=[],logs:Array<{level:string;message:string}>=[];
 let mediaRequests=0,analysisRequests=0;
 await enrichDailyReporting(daily.topics,daily.reportDate,(level,message)=>logs.push({level,message}),{
  research:async source=>{attempts.push(source.topicId);return researched(source,'background');},
  assets:async source=>{mediaRequests++;return source;},
  analyze:async()=>{analysisRequests++;return daily.topics[0].aiAnalysis!;}
 });
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),[]);
 assert.deepEqual(attempts,Array.from({length:10},(_,i)=>'story-'+i));
 assert.equal(mediaRequests,0);
 assert.equal(analysisRequests,0);
 assert.ok(logs.some(entry=>entry.level==='warn'&&entry.message.includes('0/3')&&entry.message.includes('10')));
});

test('optional media failure keeps current reporting eligible and does not abandon the three-story target',async()=>{
 const daily=edition();
 await enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {
  research:async source=>researched(source),
  assets:async()=>{throw new Error('photo provider unavailable');},
  analyze:async()=>daily.topics[0].aiAnalysis!
 });
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),['story-0','story-1','story-2']);
});

test('three already supported stories avoid unnecessary new research',async()=>{
 const daily=edition();let attempts=0;
 for(const topic of daily.topics.slice(0,3))topic.research=researched(shareEnEditorialSource(daily,topic.id)).research;
 await enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {
  research:async source=>{attempts++;return researched(source);}
 });
 assert.equal(attempts,0);
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),['story-0','story-1','story-2']);
});

test('maintenance fencing stops backfill instead of treating it as a failed news candidate',async()=>{
 const daily=edition();let attempts=0;
 await assert.rejects(enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {
  research:async()=>{attempts++;throw new MaintenanceError('数据维护进行中');}
 }),MaintenanceError);
 assert.equal(attempts,1);
});
