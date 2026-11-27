import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from './helpers/data-fixtures';
import {extractResearchDocument} from '../src/lib/topic-sharing/research/discovery';
import {researchTopicShare} from '../src/lib/topic-sharing/research';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';

const source:TopicShareSource={ref:{kind:'daily',date:'2026-11-27',topicId:'stocks'},sourceKey:'a'.repeat(64),fingerprint:'b'.repeat(64),date:'2026-11-27',observedAt:'2026-11-27T08:00:00Z',topicId:'stocks',title:'A股史诗级暴涨原因',summary:'',detail:'',context:'',categories:['news'],rank:1,signal:'new',links:[]};
const html=(date='')=>`<title>A股上涨</title>${date?`<meta property="article:published_time" content="${date}">`:''}<article>${'A股11月27日上涨，上证指数午后拉升。'.repeat(25)}</article>`;
test('current reporting requires a valid date relative to the edition, including feed fallback and archive regeneration',()=>{
 for(const date of ['', 'not-a-date','2030-01-01'])assert.equal(extractResearchDocument('https://news.example.com/article',html(date),'2026-11-27T09:00:00Z','event',{editionDate:'2026-11-27'}).purpose,'background');
 assert.equal(extractResearchDocument('https://news.example.com/article',html('2026-11-15'),'2026-11-27T09:00:00Z','event',{editionDate:'2026-11-15'}).purpose,'event');
 assert.equal(extractResearchDocument('https://news.example.com/article',html(),'2026-11-27T09:00:00Z','event',{editionDate:'2026-11-27',feedPublishedAt:'2026-11-10'}).purpose,'background');
 assert.equal(extractResearchDocument('https://news.example.com/article',html(),'2026-11-27T09:00:00Z','event',{editionDate:'2026-11-27',feedPublishedAt:'2026-11-27'}).purpose,'event');
});
test('generic English stocks vocabulary cannot qualify Brazil as the China event or freeze its discussion thread',async()=>{
 const result=await researchTopicShare(source,{plan:async()=>({questions:[],anchors:['Shanghai Composite'],queries:[{query:'China stocks rally',purpose:'event',language:'en'}]}),search:async query=>query.language==='en'?[{title:'Brazil stocks fall after budget vote',snippet:'Brazil stocks fall',url:'https://news.qq.com/rain/a/20261127A0000100',publishedAt:'2026-11-27'}]:[],read:async url=>({url,contentType:'text/html',text:'<title>Brazil stocks fall after budget vote</title><meta property="article:published_time" content="2026-11-27"><article>'+('Brazil stocks fell after a budget vote. ').repeat(20)+'</article>'})});
 assert.equal(result.research?.documents.length,0);assert.equal(result.research?.threadCandidates?.length,0);
});
test('new daily writer, repair and validation use the same current-reporting eligibility while legacy remains readable',async()=>{
 const {shareEnSupportedTopicIds,validShareEnHighlightIds,shareEnRepairs}=await import('../src/lib/shareen-draft');
 const daily=report('2026-11-27');daily.topics=Array.from({length:4},(_,i)=>({...structuredClone(daily.topics[0]),id:'story-'+i,rank:i+1}));
 daily.topics[0].research={policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:'ready',questions:[],queries:[],warnings:[],documents:[{id:'r-news',title:'A股上涨',publisher:'News',url:'https://news.example.com/report',text:'具体新闻。',publishedAt:'2026-11-27',retrievedAt:'2026-11-27T09:00:00Z',purpose:'event'}]};
 assert.deepEqual(shareEnSupportedTopicIds(daily,true),['story-0']);
 assert.equal(validShareEnHighlightIds(['story-0'],daily,true,'current-news-v1'),true);
 assert.equal(validShareEnHighlightIds(['story-0','story-1','story-2'],daily,true,'current-news-v1'),false);
 assert.equal(validShareEnHighlightIds(['story-0','story-1','story-2'],daily,true),true);
 const state={layout:'editorial' as const,reportingPolicy:'current-news-v1' as const,topics:Object.fromEntries(daily.topics.map(t=>[t.id,{title:'A source headline',hook:'A specific event',whatHappened:'A concrete current report.',whyItMatters:'A specific editorial take.',battle:null}])),highlightIds:['story-0'],posts:[],selectedPostId:'',top3:[]};
 assert.ok(!shareEnRepairs(state,daily).some(repair=>repair.field==='highlightIds'));
});
test('daily exports, ALT and canvas include the original observation and current source even without classified attitudes',async()=>{
 const {savedShareEnFixture}=await import('./helpers/shareen-fixture');const {shareEnTextFiles}=await import('../src/lib/share-export');const {shareEnCanvasHeight}=await import('../src/lib/comments/sharing');
 const daily=report('2026-11-27');daily.topics=Array.from({length:3},(_,i)=>({...structuredClone(daily.topics[0]),id:'story-'+i,rank:i+1}));
 const copy=await savedShareEnFixture(daily),topic=daily.topics.find(t=>t.id===copy.highlights[0].topicId)!;delete topic.aiAnalysis;
 topic.readerComments=[{id:'qq-news:original',sourceId:'qq-news',sourceName:'腾讯新闻',articleUrl:'https://new.qq.com/rain/a/20261127A0000100',url:'https://new.qq.com/rain/a/20261127A0000100',text:'政策落地之后再看结果。',observedAt:'2026-11-27T09:00:00Z',rank:1}];
 topic.research={policy:'news-research-v1',checkedAt:'2026-11-27T09:00:00Z',status:'ready',queries:[],questions:[],warnings:[],documents:[{id:'r-current',title:'Current source',publisher:'News',url:'https://news.example.com/current',text:'PRIVATE FULL TEXT',publishedAt:'2026-11-27',retrievedAt:'2026-11-27T09:00:00Z',purpose:'event'}]};
 for(const language of ['en','zh'] as const){const files=shareEnTextFiles(daily,copy,language),sources=new TextDecoder().decode(files.find(f=>f.name==='sources.txt')!.data),alt=new TextDecoder().decode(files.find(f=>f.name==='alt-text.txt')!.data);assert.match(sources,/qq-news:original/);assert.match(sources,/政策落地/);assert.match(sources,/https:\/\/news.example.com\/current/);assert.match(alt,/政策落地/);assert.doesNotMatch(sources,/PRIVATE FULL TEXT/);assert.ok(shareEnCanvasHeight(daily,copy,1,language)>1500);}
});
test('same-source regeneration retains verified media and neutral comments when fresh capture fails',async()=>{
 const {reuseTopicShareAssets}=await import('../src/lib/topic-sharing/assets');
 const old={...source,photo:{id:'c'.repeat(64),sourceUrl:'https://img.example.com/news.webp',pageUrl:'https://news.example.com/report',publisher:'News',width:800,height:500,dataBase64:'ZGF0YQ=='},readerComments:[{id:'qq-news:original',sourceId:'qq-news',sourceName:'腾讯新闻',articleUrl:'https://new.qq.com/rain/a/20261127A0000100',url:'https://new.qq.com/rain/a/20261127A0000100',text:'政策落地之后再看结果。',observedAt:'2026-11-27T09:00:00Z',rank:1}]};
 const fresh={...source,baseFingerprint:source.fingerprint,fingerprint:'d'.repeat(64),readerComments:[]};
 const result=reuseTopicShareAssets(old,fresh);assert.deepEqual(result.photo,old.photo);assert.deepEqual(result.readerComments,old.readerComments);
 assert.equal(reuseTopicShareAssets({...old,baseFingerprint:'e'.repeat(64)},fresh).photo,undefined);
});
