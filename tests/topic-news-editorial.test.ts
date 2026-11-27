import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {topicShareCopy} from './helpers/topic-sharing-fixture';
import {prepareTopicShareDraft} from '../src/lib/topic-sharing/validation';
import {generateTopicShare} from '../src/lib/topic-sharing/generation';
import {TopicSharePoster,topicSharePosterHeight} from '../src/components/topic-sharing/topic-share-poster';
import {topicShareTextFiles} from '../src/lib/topic-sharing/export';
import {topicPublication} from '../src/lib/publications/projection';
import {withTopicShareResearch} from '../src/lib/topic-sharing/source';
import type {TopicShareSource} from '../src/lib/topic-sharing/types';
import {ArticleText} from '../src/components/publications/article-text';
import {PublicationReader} from '../src/components/publications/publication-reader';

function evidence():TopicShareSource{
 return withTopicShareResearch({ref:{kind:'daily',date:'2026-11-26',topicId:'iowa'},sourceKey:'a'.repeat(64),fingerprint:'b'.repeat(64),topicId:'iowa',title:'爱荷华州弹药厂处置劣化材料',date:'2026-11-26',observedAt:'2026-11-26T12:00:00Z',summary:'',detail:'',context:'',categories:['news'],rank:1,signal:'new',links:[]},{policy:'news-research-v1',checkedAt:'2026-11-27T00:00:00Z',status:'ready',questions:['后续监测如何开展'],queries:[{query:'Iowa Army EPA update',purpose:'event'}],documents:[{id:'r-epa',title:'EPA sampling update',url:'https://www.epa.gov/newsreleases/iowa-update',publisher:'EPA',text:'EPA said that air, water and soil sampling would continue. The update was published on November 24.',retrievedAt:'2026-11-27T00:00:00Z',purpose:'event'}],warnings:[]});
}

test('share cover is a compact brief and one take, while the independently edited article and citations are exported and published',()=>{
 const source=evidence(),copy=topicShareCopy(source);copy.editorialPolicy='news-commentary-v1';
 copy.en.hook='INTERNAL HOOK';copy.en.context='LONG BACKGROUND FOR THE ARTICLE';copy.en.question='REMOVED ENGAGEMENT QUESTION';copy.en.whyItMatters='A successful blast is no substitute for accountable monitoring.';
 copy.en.article={title:'The Iowa disposal and the environmental follow-up',body:'## What happened\n\nThe public update describes continuing monitoring. [r-epa]\n\n## Our take\n\nPublish the measurements and keep responsibility visible.'};
 copy.zh.article={title:'爱荷华处置事件与后续监测',body:'## 事件进展\n\n公开说明提到将继续开展监测。[r-epa]\n\n## WcCAT点评\n\n爆炸结束，环境责任不能就此结案。'};
 const record={id:source.sourceKey,revision:'c'.repeat(64),source,copy};
 const markup=renderToStaticMarkup(createElement(TopicSharePoster,{record,language:'en'}));
 assert.match(markup,/A successful blast/);assert.match(markup,/OUR TAKE/);assert.doesNotMatch(markup,/WHY IT MATTERS|THE CONTEXT|INTERNAL HOOK|LONG BACKGROUND|REMOVED ENGAGEMENT QUESTION|continuing monitoring/);
 assert.ok(topicSharePosterHeight(record,'en')<=1350,'a brief cover does not reserve a long article canvas');
 const prepared=prepareTopicShareDraft(copy,source);assert.equal(prepared.copy.en.article?.body,copy.en.article.body);
 const files=topicShareTextFiles(record),text=(name:string)=>new TextDecoder().decode(files.find(file=>file.name===name)!.data);
 assert.match(text('article-en.md'),/continuing monitoring/);assert.match(text('article-zh.md'),/环境责任不能就此结案/);assert.match(text('sources.txt'),/www.epa.gov\/newsreleases\/iowa-update/);
 const published=topicPublication(record);assert.equal(published.cards[0].en.article?.body,copy.en.article.body);assert.ok(published.cards[0].links.some(link=>link.url.includes('epa.gov')));
 assert.doesNotMatch(JSON.stringify(published),/questions|queries|checkedAt|research.*warnings/);
 const page=renderToStaticMarkup(createElement(PublicationReader,{publication:{id:'a'.repeat(24),publishedAt:'2026-11-27T00:00:00Z',payload:published},language:'en'}));
 assert.equal(page.split(copy.en.article.title).length-1,1,'the full article title appears once');assert.doesNotMatch(page,/ORIGINAL RANK|The context, original Chinese sources/);assert.match(page,/<h2>Our take<\/h2>/);
});

test('the bilingual writing request distinguishes the brief from the researched article and keeps hidden fields optional',async()=>{
 const oldKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='test-news-only';
 const source=evidence(),draft=topicShareCopy(source);let calls=0;
 for(const language of ['en','zh'] as const){draft[language].hook='';draft[language].context='';draft[language].question='';draft[language].article={title:language==='en'?'The full story':'完整报道',body:language==='en'?'A reported monitoring program continues.\n\n## Our take\n\nKeep environmental accountability visible.':'后续监测继续开展。\n\n## WcCAT点评\n\n环境责任不能就此结案。'};}
 try{
  const copy=await generateTopicShare(source,{fetch:async(_url,options)=>{
   calls++;const request=JSON.parse(String(options?.body)),system=request.messages[0].content,payload=JSON.parse(request.messages[1].content);
   assert.match(system,/companion article/i);assert.match(system,/Do not.*(?:diagnostic|saved material|hot.list)/i);assert.match(system,/clear.*(?:stance|judgment|take)|explicit.*(?:stance|judgment|take)/i);
   assert.match(JSON.stringify(payload.source.researchDocuments),/air, water and soil/);assert.ok(!system.includes('do not browse, research'));
   return Response.json({choices:[{message:{content:JSON.stringify({column:'inside',en:draft.en,zh:draft.zh})}}]});
  }});
  assert.equal(calls,1,'one copy request, no editorial retry');assert.equal(copy.editorialPolicy,'news-commentary-v2');
  const warnings=prepareTopicShareDraft(copy,source).reviewWarnings;
  assert.ok(!warnings.some(w=>['en.hook','en.context','en.question','zh.hook','zh.context','zh.question'].includes(w.path)&&w.code==='missing_text'));
 }finally{if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});

test('article rendering resolves only frozen source references and never executes raw HTML or model links',()=>{
 const markup=renderToStaticMarkup(createElement(ArticleText,{body:'## Status\n\nA monitoring statement. [r-epa]\n\n<script>alert(1)</script> [bad](javascript:alert(1))',sources:[{sourceId:'research',researchId:'r-epa',name:'EPA',title:'A monitoring update',url:'https://www.epa.gov/newsreleases/update',kind:'article'}]}));
 assert.match(markup,/href="#r-epa"/);assert.doesNotMatch(markup,/<script|href="javascript:/);assert.match(markup,/&lt;script&gt;/);
 const quote=renderToStaticMarkup(createElement(ArticleText,{body:'One reader expressed caution. [qq-news:7532014236337559055]',sources:[{sourceId:'qq-news',researchId:'qq-news:7532014236337559055',name:'Tencent News',title:'Original comment',url:'https://new.qq.com/rain/a/20261127A0CXFH00',kind:'post'}]}));
 assert.match(quote,/href="#qq-news:7532014236337559055"/);assert.doesNotMatch(quote,/>\[qq-news:7532014236337559055\]</);
});
