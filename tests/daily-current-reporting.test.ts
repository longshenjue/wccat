import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from './helpers/data-fixtures';

test('explicit daily reporting researches a bounded shortlist and hands current source bodies to analysis without changing ranking',async()=>{
 const {enrichDailyReporting}=await import('../src/lib/newsroom/daily-reporting').catch(error=>assert.fail(`Daily reporting research is missing: ${error.message}`));
 const daily=report('2026-11-27');daily.topics=Array.from({length:10},(_,i)=>({...structuredClone(daily.topics[0]),id:'story-'+i,rank:i+1,title:'具体新闻'+i}));
 const order=daily.topics.map(topic=>topic.id),researched:string[]=[];
 await enrichDailyReporting(daily.topics,daily.reportDate,()=>{}, {research:async source=>{researched.push(source.topicId);return {...source,research:{policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:'ready',questions:[],queries:[],documents:[{id:'r-current',url:'https://www.agency.gov/news/2026-11-27/update',title:'Current announcement',publisher:'Agency',publishedAt:'2026-11-27',retrievedAt:'2026-11-27T09:00:00Z',purpose:'event',text:'A specific dated development.'}],warnings:[]}};},assets:async source=>source,analyze:async(_topic,contexts)=>{assert.match(contexts![0].text,/specific dated development/);return {...daily.topics[0].aiAnalysis!,summary:'今日的新进展',detailedContent:'11月27日发布了具体安排。'};}});
 assert.equal(researched.length,3);assert.deepEqual(daily.topics.map(topic=>topic.id),order);assert.equal(daily.topics.filter(topic=>topic.research?.documents.length).length,3);assert.equal(daily.topics.filter(topic=>topic.aiAnalysis?.summary==='今日的新进展').length,3);
});
