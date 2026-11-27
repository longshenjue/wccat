import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTopicShare} from '../src/lib/topic-sharing/research';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';
import {resolveCommentThread} from '../src/lib/comments/adapters';

const source:TopicShareSource={ref:{kind:'daily',date:'2026-11-27',topicId:'stocks'},sourceKey:'a'.repeat(64),fingerprint:'b'.repeat(64),date:'2026-11-27',observedAt:'2026-11-27T08:00:00Z',topicId:'stocks',title:'A股史诗级暴涨原因',summary:'',detail:'',context:'',categories:['news'],rank:1,signal:'new',links:[]};
test('a different market rally does not become this A-share event merely by mentioning China in the body',async()=>{
 const result=await researchTopicShare(source,{plan:async()=>({questions:[],anchors:['stocks','rally'],queries:[{query:'China stocks rally',purpose:'event'}]}),search:async()=>[{title:'美股史诗级反弹带动纳指QDII上涨',snippet:'A股ETF也有表现，China stocks rally',url:'https://www.sohu.com/a/1105745839_223785'}],read:async url=>({url,contentType:'text/html',text:'<title>美股史诗级反弹带动纳指QDII上涨</title><article>'+('China stocks rally，A股ETF也有表现。').repeat(20)+'</article>'})});
 assert.equal(result.research?.documents.length,0);
});
test('the current Tencent article host resolves to its original comment thread',()=>{
 const thread=resolveCommentThread({sourceId:'qq-news',url:'https://news.qq.com/rain/a/20261127A0BGAN00'});
 assert.equal(thread?.articleUrl,'https://new.qq.com/rain/a/20261127A0BGAN00');assert.match(thread?.apiUrl??'',/getQQNewsComment/);
});
test('current story discovery preserves a dated Chinese event query and never replaces it with an encyclopedia',async()=>{
 const queries:Array<{query:string;purpose:string}>=[];
 const result=await researchTopicShare(source,{now:()=>Date.parse('2026-11-27T09:00:00Z'),plan:async()=>({questions:[],anchors:['A-shares','rally'],queries:[{query:'China A-share rally',purpose:'event'},{query:'Stock Connect',purpose:'background'}]}),search:async query=>{queries.push(query);return [{title:'A股史诗级暴涨',url:'https://finance.sina.com.cn/stock/2026-11-27/doc-123.shtml',snippet:'11月27日A股上涨'}];},read:async url=>({url,contentType:'text/html',text:'<title>A股史诗级暴涨</title><meta property="article:published_time" content="2026-11-27T14:10:00+08:00"><meta property="og:image" content="https://n.sinaimg.cn/finance/current-market.jpg"><article>'+('11月27日，A股午后拉升。A-shares rallied after a policy announcement. ').repeat(8)+'</article>'})});
 assert.ok(queries.some(q=>q.purpose==='event'&&q.query.includes('A股史诗级暴涨原因')&&q.query.includes('2026-11-27')));
 assert.ok(queries.some(q=>q.purpose==='event'&&/China|A-share/.test(q.query)));
 assert.ok(result.research?.documents.some(doc=>doc.purpose==='event'&&doc.publishedAt?.startsWith('2026-11-27')));
 assert.ok(result.research?.imageCandidates?.some(image=>image.url.includes('current-market.jpg')));
});

test('an encyclopedia history cannot become the sole current-event evidence',async()=>{
 const result=await researchTopicShare(source,{now:()=>Date.parse('2026-11-27T09:00:00Z'),plan:async()=>({questions:[],anchors:['A-shares'],queries:[{query:'China A-shares',purpose:'event'}]}),search:async()=>[{title:'Shanghai-Hong Kong Stock Connect',url:'https://en.wikipedia.org/wiki/Shanghai-Hong_Kong_Stock_Connect',snippet:'A-shares market access'}],read:async url=>({url,contentType:'text/html',text:'<title>Shanghai-Hong Kong Stock Connect</title><article>'+('A-shares market access started in 2014. Quotas changed in 2020. ').repeat(8)+'</article>'})});
 assert.equal(result.research?.documents.filter(doc=>doc.purpose==='event').length,0);
 assert.ok(result.research?.warnings.some(message=>/当日|当前事件/.test(message)));
});

test('current reporting is recognized when a headline splits or reorders the original hot-search phrase',async()=>{
 const result=await researchTopicShare(source,{now:()=>Date.parse('2026-11-27T09:00:00Z'),plan:async()=>({questions:[],anchors:['A股史诗级暴涨'],queries:[{query:'A股史诗级暴涨',purpose:'event',language:'zh'}]}),search:async()=>[{title:'史诗级暴涨！超260股涨停',snippet:'11月27日，A股主要指数午后拉升。',url:'https://finance.sina.com.cn/stock/2026-11-27/doc-inkaczqn5628056.shtml'}],read:async url=>({url,contentType:'text/html',text:'<title>史诗级暴涨！超260股涨停</title><article>'+('11月27日，A股主要指数午后直线拉升，上证指数涨超3%。').repeat(12)+'</article>'})});
 assert.ok(result.research?.documents.length);assert.ok(result.research?.threadCandidates?.some(thread=>thread.sourceId==='sina-news'));
});

test('current Chinese market queries keep the market entity and discard older mismatched results before comment discovery',async()=>{
 const {searchResearchSources}=await import('../src/lib/topic-sharing/research/search');const previous=process.env.BRAVE_SEARCH_API_KEY;delete process.env.BRAVE_SEARCH_API_KEY;
 try{
  const calls:string[]=[];
  const hits=await searchResearchSources({query:'A股史诗级暴涨原因',purpose:'event',date:'2026-11-27',language:'zh'},{signal:AbortSignal.timeout(1000),onApiRequest(){},read:async url=>{calls.push(url);if(url.includes('mkt=zh-CN'))return {url,contentType:'text/html',text:'<!DOCTYPE html><title>Search unavailable</title>'};const query=new URL(url).searchParams.get('q')!;assert.match(query,/A股\s+史诗级暴涨/);return {url,contentType:'text/xml',text:'<rss><channel><item><title>美股史诗级暴涨</title><link>https://finance.sina.com.cn/stock/2026-11-05/old.shtml</link><pubDate>Thu, 05 Nov 2026 12:00:00 GMT</pubDate></item><item><title>A股史诗级暴涨</title><link>https://finance.sina.com.cn/stock/2026-11-27/current.shtml</link><pubDate>Fri, 27 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>'};}});
  assert.ok(calls.some(url=>url.includes('news.google.com')));assert.ok(calls.some(url=>url.includes('mkt=en-US')));assert.equal(hits.length,1);assert.match(hits[0].url,/current/);
 }finally{if(previous===undefined)delete process.env.BRAVE_SEARCH_API_KEY;else process.env.BRAVE_SEARCH_API_KEY=previous;}
});
