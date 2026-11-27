import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';

const source:TopicShareSource={ref:{kind:'daily',date:'2026-11-27',topicId:'stocks'},sourceKey:'a'.repeat(64),fingerprint:'b'.repeat(64),date:'2026-11-27',observedAt:'2026-11-27T08:00:00Z',topicId:'stocks',title:'A股午后拉升',summary:'',detail:'',context:'',categories:['news'],rank:1,signal:'new',links:[],research:{policy:'news-research-v1',checkedAt:'2026-11-27T08:00:00Z',status:'ready',queries:[],questions:[],warnings:[],documents:[],imageCandidates:[{url:'https://n.sinaimg.cn/finance/news.jpg',pageUrl:'https://finance.sina.com.cn/stock/2026-11-27/doc-inkaczqn5628056.shtml',publisher:'新浪财经'}],threadCandidates:[{sourceId:'qq-news',sourceName:'腾讯新闻',title:'A股午后拉升',url:'https://new.qq.com/rain/a/20261127A04GH900'}]}};
test('explicit topic asset capture seeks a photo and real comments without requiring old attitude analysis',async()=>{
 const {prepareTopicShareAssets}=await import('../src/lib/topic-sharing/assets').catch(error=>assert.fail(`Topic assets are not implemented: ${error.message}`));
 const png=await sharp({create:{width:800,height:500,channels:3,background:'#315582'}}).png().toBuffer();let images=0,collections=0;
 const result=await prepareTopicShareAssets(source,{readImage:async()=>{images++;return png;},collect:async links=>{collections++;assert.equal(links[0].sourceId,'qq-news');return {comments:[{id:'qq-news:1',sourceId:'qq-news',sourceName:'腾讯新闻',articleUrl:links[0].url,url:links[0].url,text:'先看政策落地和实际成交，别只看一天的涨幅。',rank:1,likes:23,observedAt:'2026-11-27T08:00:00Z'}],runIds:['real-thread']} ;}});
 assert.equal(images,1);assert.equal(collections,1);assert.ok(result.photo?.dataBase64);assert.equal((await sharp(Buffer.from(result.photo!.dataBase64,'base64')).metadata()).format,'webp');assert.equal(result.readerComments?.[0].id,'qq-news:1');assert.equal(source.readerComments,undefined);assert.equal(result.baseFingerprint,source.fingerprint);
 const {recommendTopic,usableTopicQuotes}=await import('../src/lib/topic-sharing/recommendation');assert.equal(recommendTopic(result).evidenceLevel,'comments');assert.equal(usableTopicQuotes(result,'en')[0].quote.id,'qq-news:1');
 const {TopicSharePoster}=await import('../src/components/topic-sharing/topic-share-poster');
 const copy=topicShareCopy(result);copy.editorialPolicy='news-commentary-v2';
 const markup=renderToStaticMarkup(createElement(TopicSharePoster,{record:{id:result.sourceKey,revision:'c'.repeat(64),source:result,copy},language:'zh'}));
 assert.match(markup,/<img/);assert.match(markup,/先看政策落地和实际成交/);assert.match(markup,/新浪财经/);
});

test('required assets have explicit draft readiness instead of silently publishing a text-only cover',async()=>{
 const {topicShareReadiness}=await import('../src/lib/topic-sharing/readiness').catch(error=>assert.fail(`Topic readiness is not implemented: ${error.message}`));
 const copy=topicShareCopy(source);copy.editorialPolicy='news-commentary-v2';
 const readiness=topicShareReadiness({source,copy});assert.equal(readiness.ready,false);assert.ok(readiness.missing.includes('image'));assert.ok(readiness.missing.includes('comments'));
 const {topicShareTextFiles}=await import('../src/lib/topic-sharing/export');
 assert.throws(()=>topicShareTextFiles({id:source.sourceKey,revision:'c'.repeat(64),source,copy}),/图片|评论/);
 assert.ok(topicShareReadiness({source:{...source,research:undefined},copy}).missing.includes('news'));
});

test('a cover credits its actual occurrence rather than the first ranking link',async()=>{
 const {prepareTopicShareAssets}=await import('../src/lib/topic-sharing/assets');
 const png=await sharp({create:{width:800,height:500,channels:3,background:'#315582'}}).png().toBuffer();
 const result=await prepareTopicShareAssets({...source,cover:'https://n.sinaimg.cn/finance/news.jpg',coverAttribution:{pageUrl:'https://finance.sina.com.cn/stock/2026-11-27/current.shtml',publisher:'新浪财经'},links:[{sourceId:'baidu',sourceName:'百度热搜',title:source.title,url:'https://www.baidu.com/s?wd=stocks'}]},{readImage:async()=>png,collect:async()=>({comments:[],runIds:[]})});
 assert.equal(result.photo?.publisher,'新浪财经');assert.equal(result.photo?.pageUrl,'https://finance.sina.com.cn/stock/2026-11-27/current.shtml');
});

test('empty comments trigger one alternate-thread discovery with six total unique threads at most',async()=>{
 const {prepareTopicShareAssets}=await import('../src/lib/topic-sharing/assets');
 const calls:Array<{links:string[];max:number|undefined}>=[];let searches=0;
 const withThreads={...source,research:{...source.research!,queries:[{query:'A股午后拉升',purpose:'event' as const}],threadCandidates:Array.from({length:5},(_,i)=>({sourceId:'qq-news',sourceName:'腾讯新闻',title:source.title,url:`https://news.qq.com/rain/a/20261127A0000${i}00`}))}};
 await prepareTopicShareAssets(withThreads,{readImage:async()=>{throw Error('unavailable');},collect:async(links,max)=>{calls.push({links:links.map(link=>link.url),max});return {comments:[],runIds:[]};},discover:async()=>{searches++;return Array.from({length:5},(_,i)=>({sourceId:'qq-news',url:`https://news.qq.com/rain/a/20261127A0001${i}00`}));}});
 assert.equal(searches,1);assert.equal(calls.length,2);assert.equal(calls[0].links.length,5);assert.equal(calls[1].links.length,1);assert.equal(calls[1].max,1);
});

test('legacy covers do not announce nonexistent comments through the new attitude strip',async()=>{
 const {report}=await import('./helpers/data-fixtures');const {TopicSharePoster}=await import('../src/components/topic-sharing/topic-share-poster');
 const frozen={...source,analysis:report('2026-11-27').topics[0].aiAnalysis};const copy=topicShareCopy(frozen);copy.editorialPolicy='news-commentary-v1';
 const markup=renderToStaticMarkup(createElement(TopicSharePoster,{record:{id:source.sourceKey,revision:'c'.repeat(64),source:frozen,copy},language:'en'}));
 assert.doesNotMatch(markup,/individual comments below/);
});
