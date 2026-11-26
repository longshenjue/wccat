import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommentQuotes} from '../src/components/comment-quotes';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {ShareEnPoster,shareEnCanvasHeight} from '../src/components/shareen-poster';
import {DailySharePoster} from '../src/components/daily-share-poster';
import {shareEnTextFiles} from '../src/lib/share-export';
import {buildDailyShareCopy} from '../src/lib/daily-share-copy';
import type {CommentExamples} from '../src/lib/comments/types';
const battle={redLabel:'质疑',blueLabel:'支持'};
const quote={id:'zhihu:1',text:'<script>不能执行的文字</script> 希望公布完整证据。',englishText:'Please publish the complete evidence.',sourceId:'zhihu',sourceName:'知乎',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',likes:123,rank:1,observedAt:'2026-11-24T01:00:00Z'};
const examples:CommentExamples={...battle,red:quote,blue:{...quote,id:'zhihu:2',text:'现在的信息不足，应该等待进一步核实。',englishText:'There is too little information. Wait for verification.',likes:88},sampleCount:40,sampledAt:quote.observedAt,runIds:['source-run']};
test('shared hourly, daily and single-story comment renderer preserves the complete saved quotation',()=>{
 const text='请先说明实际安排，再讨论它可能带来的影响。'.repeat(8)+'这是完整原文的最后一句。';
 const englishText=Array(10).fill('Readers need the complete source and context before judging this specific development.').join(' ');
 const sample={...examples,blue:undefined,red:{...quote,text,englishText}};
 for(const language of ['zh','en'] as const){const markup=renderToStaticMarkup(createElement(CommentQuotes,{examples:sample,battle,language}));assert.ok(markup.includes(language==='zh'?text:englishText));assert.doesNotMatch(markup,/…/);}
});
test('real examples render with cat markers, attribution, observed likes and escaped text; empty data renders nothing',()=>{
 assert.equal(renderToStaticMarkup(createElement(CommentQuotes,{battle,language:'zh'})),'');
 const markup=renderToStaticMarkup(createElement(CommentQuotes,{examples,battle,language:'zh'}));
 assert.match(markup,/comment-quote-red/);assert.match(markup,/comment-quote-blue/);assert.match(markup,/123/);assert.match(markup,/知乎/);assert.match(markup,/非民调/);assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script>/);assert.match(markup,/href="https:\/\/www.zhihu.com\/question\/123"/);
 const one=renderToStaticMarkup(createElement(CommentQuotes,{examples:{...examples,blue:undefined},battle,language:'en'}));assert.match(one,/AI translation/);assert.doesNotMatch(one,/comment-quote-blue/);
});
test('daily long posters and focus cards show source-owned examples underneath the energy analysis',async()=>{
 const report=fixture('2026-11-24');report.topics[0].aiAnalysis!.commentExamples=examples;report.topics.push({...report.topics[0],id:'second',rank:2});
 const copy=await savedShareEnFixture(report);
 const poster=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1}));
 assert.ok(poster.indexOf('shareen-debate-energy')<poster.indexOf('comment-quotes'));assert.match(poster,/Please publish the complete evidence/);assert.equal(shareEnCanvasHeight(report,copy,1),2200);assert.equal(shareEnCanvasHeight(report,copy,0),1500);
 const long=renderToStaticMarkup(createElement(DailySharePoster,{report,copy:buildDailyShareCopy(report),language:'zh'}));assert.match(long,/comment-quotes/);
 const files=shareEnTextFiles(report,copy),sources=new TextDecoder().decode(files.find(f=>f.name==='sources.txt')!.data),alt=new TextDecoder().decode(files.find(f=>f.name==='alt-text.txt')!.data);
 assert.match(sources,/zhihu:1/);assert.match(sources,/希望公布完整证据/);assert.match(alt,/Please publish the complete evidence/);
 delete report.topics[0].aiAnalysis!.commentExamples;
 assert.equal(shareEnCanvasHeight(report,copy,1),1500);
});
test('all newly verified platforms retain clickable attribution in English and hide the removed timestamp row',()=>{
 const sources=[
  ['hupu','https://bbs.hupu.com/643288637.html','Hupu'],
  ['douban','https://www.douban.com/group/topic/504999396/','Douban'],
  ['tieba','https://tieba.baidu.com/p/11190155384','Baidu Tieba'],
  ['thepaper','https://www.thepaper.cn/newsDetail_forward_34458875','The Paper'],
  ['qq-news','https://new.qq.com/rain/a/20261112A0B42W00','Tencent News'],
  ['sina-news','https://news.sina.com.cn/s/2026-11-11/doc-iniyixxy2059982.shtml','Sina News'],
  ['netease-news','https://www.163.com/dy/article/LBJP2QG805118DFD.html','NetEase News'],
  ['ithome','https://m.ithome.com/html/1030120.htm','IT Home'],
  ['huxiu','https://www.huxiu.com/moment/1299525.html','Huxiu'],
  ['toutiao','https://m.toutiao.com/w/1882699991898124/','Toutiao']
 ];
 for(const [sourceId,url,name] of sources){
  const sample={...examples,blue:undefined,red:{...quote,id:sourceId+':1',sourceId,url,articleUrl:url}};
  const markup=renderToStaticMarkup(createElement(CommentQuotes,{examples:sample,battle,language:'en'}));
  assert.ok(markup.includes(name),sourceId);assert.ok(markup.includes('href="'+url+'"'),sourceId);assert.match(markup,/Please publish the complete evidence/);assert.doesNotMatch(markup,/<time|Sampled at|采样于/);
 }
});
