import test from 'node:test';
import assert from 'node:assert/strict';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {TopicShareRecord} from '../src/lib/topic-sharing/types';

const record:TopicShareRecord={
 id:'story-one',revision:'saved-revision',source:{
  ref:{kind:'hourly',snapshot:'2026-11-24 08:00',version:'snapshot-revision',key:'topic:one'},sourceKey:'hourly:one',fingerprint:'frozen-source',date:'2026-11-24',observedAt:'2026-11-24T00:00:00Z',
  topicId:'one',title:'原始标题',summary:'真实材料',detail:'保存的事实',context:'保存的背景',categories:['科技'],rank:3,signal:'多个平台出现',
  analysis:{summary:'保存的分析',detailedContent:'保存的分析正文',outsiderContext:'语境',model:'saved-model',platformAnalyses:[],battle:{redLabel:'追问',blueLabel:'等待',redScore:60,blueScore:40,redRationale:'追问证据',blueRationale:'等待核实'}},
  links:[{sourceId:'zhihu',sourceName:'知乎',title:'原文',url:'https://www.zhihu.com/question/123'},{sourceId:'unsafe',sourceName:'Invalid source',title:'Invalid',url:'javascript:alert(1)'}],
  commentExamples:{redLabel:'追问',blueLabel:'等待',sampleCount:12,sampledAt:'2026-11-24T00:00:00Z',runIds:['run-one'],red:{id:'zhihu:one',text:'请公布完整证据。',englishText:'Please publish the complete evidence.',sourceId:'zhihu',sourceName:'知乎',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',likes:28,rank:1,observedAt:'2026-11-24T00:00:00Z'}}
 },copy:{version:1,generatedAt:'2026-11-24T01:00:00Z',model:'saved-model',sourceFingerprint:'frozen-source',column:'voices',
  en:{headline:'A question of evidence',hook:'A request, in their own words',summary:'Readers are asking for more evidence.',context:'A discussion on a Chinese Q&A platform.',whyItMatters:'A visible question, not a measure of public opinion.',question:'What would clarify this?',posts:[{id:'en-1',pattern:'observation',text:'First unused English option.',reason:'An observation.'},{id:'en-2',pattern:'quote',text:'Edited selected English caption.',reason:'The source quote.'},{id:'en-3',pattern:'context',text:'Third English option.',reason:'Context.'}],selectedPostId:'en-2',replies:['English follow-up.'],altText:'A bilingual editorial card with an attributed comment.'},
  zh:{headline:'完整证据在哪里？',hook:'评论里的一个追问',summary:'有读者希望看到更多证据。',context:'这是中文问答平台的一段讨论。',whyItMatters:'一条可见意见，不能代表总体民意。',question:'哪些信息有助于澄清？',posts:[{id:'zh-1',pattern:'observation',text:'中文第一候选。',reason:'观察角度。'},{id:'zh-2',pattern:'quote',text:'中文第二候选。',reason:'引用角度。'},{id:'zh-3',pattern:'context',text:'已编辑并选中的中文配文。',reason:'背景角度。'}],selectedPostId:'zh-3',replies:['中文补充。'],altText:'包含有来源评论的中文话题卡。'}
 }
};

async function presentation(){
 try{return await import('../src/components/topic-sharing/topic-share-poster');}
 catch(error){assert.fail(`Topic share poster is not implemented: ${error instanceof Error?error.message:error}`);}
}
async function exporting(){
 try{return await import('../src/lib/topic-sharing/export');}
 catch(error){assert.fail(`Topic share export is not implemented: ${error instanceof Error?error.message:error}`);}
}

test('localized cards show edited copy and only genuine attributed source comments',async()=>{
 const {TopicSharePoster}=await presentation();
 const en=renderToStaticMarkup(createElement(TopicSharePoster,{record,language:'en'}));
 assert.match(en,/A question of evidence/);assert.match(en,/A request, in their own words/);
 assert.match(en,/Please publish the complete evidence/);assert.match(en,/28 likes/);
 assert.match(en,/comment-quote-red/);assert.doesNotMatch(en,/comment-quote-blue/);
 assert.match(en,/href="https:\/\/www.zhihu.com\/question\/123"/);
 assert.doesNotMatch(en,/javascript:|Invalid source|Sampled at|采样于|<time/);
 const zh=renderToStaticMarkup(createElement(TopicSharePoster,{record,language:'zh'}));
 assert.match(zh,/完整证据在哪里/);assert.match(zh,/请公布完整证据/);assert.match(zh,/28 赞/);
 assert.doesNotMatch(zh,/Please publish the complete evidence/);
});

test('cards with no usable translation leave out quotations rather than inventing a second voice',async()=>{
 const {TopicSharePoster}=await presentation();
 const missing=structuredClone(record);delete missing.source.commentExamples!.red!.englishText;
 const markup=renderToStaticMarkup(createElement(TopicSharePoster,{record:missing,language:'en'}));
 assert.doesNotMatch(markup,/comment-quotes|comment-quote-red|comment-quote-blue/);
 assert.match(markup,/Readers are asking for more evidence/);
 const zh=renderToStaticMarkup(createElement(TopicSharePoster,{record:missing,language:'zh'}));
 assert.match(zh,/请公布完整证据/);
 const mismatched=structuredClone(record);mismatched.source.analysis!.battle.redLabel='其他标签';
 assert.doesNotMatch(renderToStaticMarkup(createElement(TopicSharePoster,{record:mismatched,language:'en'})),/comment-quotes/);
});

test('package text uses the independently selected edited caption in each language and frozen provenance',async()=>{
 const {topicShareTextFiles}=await exporting();
 const files=topicShareTextFiles(record);
 const text=(name:string)=>new TextDecoder().decode(files.find(file=>file.name===name)!.data);
 assert.equal(text('post-en.txt'),'Edited selected English caption.\n');
 assert.equal(text('post-zh.txt'),'已编辑并选中的中文配文。\n');
 assert.match(text('replies-en.txt'),/English follow-up/);assert.match(text('replies-zh.txt'),/中文补充/);
 assert.match(text('alt-en.txt'),/attributed comment/);assert.match(text('alt-zh.txt'),/有来源评论/);
 assert.match(text('sources.txt'),/https:\/\/www.zhihu.com\/question\/123/);
 assert.match(text('sources.txt'),/zhihu:one/);assert.match(text('sources.txt'),/请公布完整证据/);
 assert.doesNotMatch(text('sources.txt'),/javascript:/);
 assert.match(text('experiment-notes.txt'),/quote/);assert.match(text('experiment-notes.txt'),/not.*(?:forecast|guarantee)/i);
});

test('bilingual ZIP contains both PNGs and local text bytes with no source retrieval',async()=>{
 const {createTopicShareZip}=await exporting();
 const bytes=await createTopicShareZip(record,{en:new Uint8Array([137,80,78,71,1]),zh:new Uint8Array([137,80,78,71,2])});
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map<string,Uint8Array>();let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){
  const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;
  files.set(new TextDecoder().decode(bytes.slice(offset+30,offset+30+nameLength)),bytes.slice(start,start+size));offset=start+size;
 }
 assert.deepEqual([...files.keys()],['en.png','zh.png','post-en.txt','post-zh.txt','replies-en.txt','replies-zh.txt','alt-en.txt','alt-zh.txt','sources.txt','experiment-notes.txt']);
 assert.deepEqual(files.get('zh.png'),new Uint8Array([137,80,78,71,2]));
 assert.equal(new TextDecoder().decode(files.get('post-en.txt')),'Edited selected English caption.\n');
});

test('export rejects stale evidence and missing image output while retaining a fallback caption selection',async()=>{
 const {topicShareTextFiles,createTopicShareZip}=await exporting();
 const stale=structuredClone(record);stale.copy.sourceFingerprint='other-source';
 assert.throws(()=>topicShareTextFiles(stale),/source|来源/i);
 const missing=structuredClone(record);missing.copy.zh.selectedPostId='deleted';
 assert.ok(topicShareTextFiles(missing).some(file=>file.name==='post-zh.txt'));
 await assert.rejects(createTopicShareZip(record,{en:new Uint8Array([1]),zh:new Uint8Array()}),/zh|中文/i);
});

function measuredCard(normalHeight:number,compactHeight:number){
 let compact=false;
 const zone={clientHeight:100,clientWidth:100,scrollWidth:100,get scrollHeight(){return compact?compactHeight:normalHeight;}};
 return {classList:{remove(){compact=false;},add(){compact=true;}},querySelectorAll(){return [zone];},offsetHeight:1800} as unknown as HTMLElement;
}
test('oversized topic cards fail visibly after trying a compact readable layout',async()=>{
 const {fitTopicShareCard}=await exporting();
 assert.equal(fitTopicShareCard(measuredCard(110,90),'EN'),true);
 assert.throws(()=>fitTopicShareCard(measuredCard(150,130),'中文'),/中文.*1080/);
});

test('automatic topic canvas growth includes footer borders instead of leaving export disabled by three pixels',async()=>{
 const {fitTopicShareCard}=await exporting(),previous=globalThis.getComputedStyle;
 let footerRow=100;
 const header={clientHeight:80,scrollHeight:80,offsetHeight:83,clientWidth:972,scrollWidth:972};
 const content={clientHeight:770,scrollHeight:770,offsetHeight:770,clientWidth:972,scrollWidth:972};
 const footer={get clientHeight(){return footerRow-3;},get offsetHeight(){return footerRow;},scrollHeight:119,clientWidth:972,scrollWidth:972};
 const style={height:'1080px',set gridTemplateRows(value:string){footerRow=Number(value.match(/(\d+)px$/)?.[1]??100);}};
 const card={style,dataset:{topicBaseHeight:'1080'},classList:{remove(){},add(){}},querySelectorAll(){return [header,content,footer];},querySelector(selector:string){return selector.includes('header')?header:selector.includes('content')?content:footer;},offsetHeight:1104} as unknown as HTMLElement;
 globalThis.getComputedStyle=()=>({paddingTop:'42px',paddingBottom:'42px',rowGap:'24px'}) as CSSStyleDeclaration;
 try{assert.equal(fitTopicShareCard(card,'EN'),true);assert.ok(footer.clientHeight>=footer.scrollHeight);}
 finally{globalThis.getComputedStyle=previous;}
});

test('recommendations keep English and Chinese editorial reasoning in separate readable lists',async()=>{
 let component;
 try{component=await import('../src/components/topic-sharing/topic-share-recommendations');}
 catch(error){assert.fail(`Topic recommendations are not implemented: ${error instanceof Error?error.message:error}`);}
 const recommendation={column:'inside' as const,evidenceLevel:'analysis' as const,warnings:['Check the saved source.'],english:{score:64,reason:'English reader needs a culture explanation.',angle:'Translate the unfamiliar context.'},chinese:{score:71,reason:'中文读者更关心具体影响。',angle:'解释实际生活关联。'}};
 const markup=renderToStaticMarkup(createElement(component.TopicShareRecommendationsView,{english:[{id:'en-story',ref:record.source.ref,title:'English pick',date:'2026-11-24',rank:2,recommendation}],chinese:[{id:'zh-story',ref:record.source.ref,title:'中文推荐',date:'2026-11-23',rank:3,recommendation}],onSelect:()=>{}}));
 assert.match(markup,/English reader needs a culture explanation/);assert.match(markup,/中文读者更关心具体影响/);
 assert.match(markup,/Translate the unfamiliar context/);assert.match(markup,/解释实际生活关联/);
 assert.match(markup,/64\/100/);assert.match(markup,/71\/100/);assert.match(markup,/English picks/);assert.match(markup,/中文推荐/);
 assert.doesNotMatch(markup,/%|爆款概率|viral probability/);
});

test('mismatched comment labels omit the same evidence from both cards and the source file',async()=>{
 const {TopicSharePoster}=await presentation(),{topicShareTextFiles}=await exporting();
 const mismatched=structuredClone(record);mismatched.source.analysis!.battle.redLabel='不同观点';
 for(const language of ['en','zh'] as const){
  const card=renderToStaticMarkup(createElement(TopicSharePoster,{record:mismatched,language}));
  assert.doesNotMatch(card,/comment-quotes|请公布完整证据|Please publish the complete evidence/);
 }
 const sources=new TextDecoder().decode(topicShareTextFiles(mismatched).find(file=>file.name==='sources.txt')!.data);
 assert.doesNotMatch(sources,/Comment ID:|Original: 请公布完整证据|Please publish the complete evidence/);
 assert.match(sources,/https:\/\/www.zhihu.com\/question\/123/);
});

test('a comment missing its English translation remains in the Chinese card and source file',async()=>{
 const {TopicSharePoster}=await presentation(),{topicShareTextFiles}=await exporting();
 const untranslated=structuredClone(record);delete untranslated.source.commentExamples!.red!.englishText;
 const en=renderToStaticMarkup(createElement(TopicSharePoster,{record:untranslated,language:'en'}));
 assert.doesNotMatch(en,/comment-quotes|Please publish the complete evidence/);
 const zh=renderToStaticMarkup(createElement(TopicSharePoster,{record:untranslated,language:'zh'}));
 assert.match(zh,/请公布完整证据/);
 const sources=new TextDecoder().decode(topicShareTextFiles(untranslated).find(file=>file.name==='sources.txt')!.data);
 assert.match(sources,/Original: 请公布完整证据/);
});

test('translation review badges stay in admin and do not leak into public card or text exports',async()=>{
 const previous=(globalThis as {React?:unknown}).React;(globalThis as {React?:unknown}).React=React;
 try{
  const {TopicShareReview}=await import('../src/components/topic-sharing/topic-share-review');
  const warnings=[{path:'en.posts[2].text',code:'language',message:'PRIVATE_REVIEW_ONLY',values:['<script>']}];
  const markup=renderToStaticMarkup(createElement(TopicShareReview,{warnings}));
  assert.match(markup,/候选配文 3/);assert.match(markup,/不影响生成/);assert.match(markup,/&lt;script&gt;/);
  const reviewed={...record,reviewWarnings:warnings},poster=await presentation(),exports=await exporting();
  assert.doesNotMatch(renderToStaticMarkup(createElement(poster.TopicSharePoster,{record:reviewed,language:'en'})),/PRIVATE_REVIEW_ONLY|编辑提示/);
  for(const file of exports.topicShareTextFiles(reviewed))assert.doesNotMatch(new TextDecoder().decode(file.data),/PRIVATE_REVIEW_ONLY|编辑提示/);
  const mixed=structuredClone(record);mixed.source.commentExamples!.red!.englishText='Please explain 中文名称.';
  assert.match(renderToStaticMarkup(createElement(poster.TopicSharePoster,{record:mixed,language:'en'})),/Please explain 中文名称/);
 }finally{(globalThis as {React?:unknown}).React=previous;}
});

test('analysis-only saved comment evidence keeps its exact original and translation in cards and sources',async()=>{
 const {TopicSharePoster}=await presentation(),{topicShareTextFiles}=await exporting();
 const analysisOnly=structuredClone(record);
 analysisOnly.source.analysis!.commentExamples=analysisOnly.source.commentExamples;delete analysisOnly.source.commentExamples;
 const zh=renderToStaticMarkup(createElement(TopicSharePoster,{record:analysisOnly,language:'zh'}));
 const en=renderToStaticMarkup(createElement(TopicSharePoster,{record:analysisOnly,language:'en'}));
 assert.match(zh,/“请公布完整证据。”/);assert.match(en,/“Please publish the complete evidence\.”/);
 assert.doesNotMatch(zh,/comment-quote-blue/);assert.doesNotMatch(en,/comment-quote-blue/);
 const sources=new TextDecoder().decode(topicShareTextFiles(analysisOnly).find(file=>file.name==='sources.txt')!.data);
 assert.match(sources,/Comment ID: zhihu:one\n/);assert.match(sources,/Original: 请公布完整证据。\n/);
 assert.match(sources,/AI translation: Please publish the complete evidence\.\n/);
 assert.equal(sources.match(/Comment ID:/g)?.length,1);
});

async function clientState(){
 try{return await import('../src/lib/topic-sharing/client-state');}
 catch(error){assert.fail(`Saved topic-share reconciliation is not implemented: ${error instanceof Error?error.message:error}`);}
}

for(const action of ['frozen reload','save'] as const){
 test(`${action} keeps a known newer generation source while accepting the server's frozen draft`,async()=>{
  const {reconcileSavedTopicShareData}=await clientState();
  const frozen=structuredClone(record);delete frozen.source.commentExamples;frozen.copy.column='inside';
  const latest={...structuredClone(frozen.source),fingerprint:'newer-source-B',commentExamples:structuredClone(record.source.commentExamples)};
  const currentRecommendation={column:'voices' as const,evidenceLevel:'comments' as const,warnings:['The current source has saved bilingual comments.'],english:{score:77,reason:'Current source B.',angle:'A saved comment.'},chinese:{score:73,reason:'新的双语评论材料。',angle:'具体评论。'}};
  const previous={source:latest,recommendation:currentRecommendation,record:frozen};
  const incoming=structuredClone(frozen);incoming.revision=action==='save'?'saved-edits-revision':'latest-saved-revision';incoming.copy.en.headline='A newer saved headline';
  const result=reconcileSavedTopicShareData(previous,{source:incoming.source,recommendation:{...currentRecommendation,column:'inside',evidenceLevel:'analysis'},record:incoming});
  assert.equal(result.source.fingerprint,'newer-source-B');
  assert.equal(result.recommendation.column,'voices');assert.equal(result.recommendation.evidenceLevel,'comments');
  assert.equal(result.record!.source.fingerprint,'frozen-source');
  assert.equal(result.record!.source.commentExamples,undefined);
  assert.equal(result.record!.copy.en.headline,'A newer saved headline');
  assert.equal(result.record!.revision,action==='save'?'saved-edits-revision':'latest-saved-revision');
 });
}

test('opening a frozen record remains possible without a current source, and changing stories cannot reuse another source',async()=>{
 const {reconcileSavedTopicShareData}=await clientState();
 const recommendation={column:'voices' as const,evidenceLevel:'comments' as const,warnings:[],english:{score:77,reason:'Saved source.',angle:'A saved comment.'},chinese:{score:73,reason:'已保存材料。',angle:'具体评论。'}};
 const incoming={source:record.source,recommendation,record};
 assert.equal(reconcileSavedTopicShareData(undefined,incoming).record!.source.fingerprint,'frozen-source');
 const other={...incoming,source:{...record.source,sourceKey:'hourly:different',fingerprint:'different-story-source'}};
 const result=reconcileSavedTopicShareData(other,incoming);
 assert.equal(result.source.sourceKey,'hourly:one');assert.equal(result.source.fingerprint,'frozen-source');
});

test('reload recovers from source A to the current source B without changing the frozen draft evidence',async()=>{
 const {reloadTopicShareData}=await clientState();
 const priorRecommendation={column:'inside' as const,evidenceLevel:'analysis' as const,warnings:[],english:{score:51,reason:'Old source A.',angle:'Old context.'},chinese:{score:49,reason:'旧材料。',angle:'旧背景。'}};
 const previous={source:record.source,recommendation:priorRecommendation,record};
 const live={source:{...structuredClone(record.source),fingerprint:'live-source-B'},recommendation:{...priorRecommendation,column:'voices' as const,evidenceLevel:'comments' as const},record:{...structuredClone(record),revision:'current-frozen-draft'}};
 const next=await reloadTopicShareData(previous,{live:async()=>live,frozen:async()=>{throw new Error('An available live source must be used.');}});
 assert.equal(next.source.fingerprint,'live-source-B');assert.equal(next.recommendation.column,'voices');
 assert.equal(next.record!.source.fingerprint,'frozen-source');assert.equal(next.record!.copy.sourceFingerprint,'frozen-source');
 assert.equal(next.record!.revision,'current-frozen-draft');
});

test('reload falls back to the saved draft after live source deletion while retaining the last known newer source',async()=>{
 const {reloadTopicShareData}=await clientState();
 const recommendation={column:'voices' as const,evidenceLevel:'comments' as const,warnings:[],english:{score:77,reason:'Known source B.',angle:'A saved comment.'},chinese:{score:73,reason:'已知较新材料。',angle:'具体评论。'}};
 const previous={source:{...structuredClone(record.source),fingerprint:'known-source-B'},recommendation,record};
 const frozen={source:record.source,recommendation:{...recommendation,column:'inside' as const,evidenceLevel:'analysis' as const},record:{...structuredClone(record),revision:'latest-frozen-revision'}};
 const readers={live:async()=>{throw Object.assign(new Error('来源已清理'),{status:404});},frozen:async()=>frozen};
 const known=await reloadTopicShareData(previous,readers);
 assert.equal(known.source.fingerprint,'known-source-B');assert.equal(known.recommendation.column,'voices');assert.equal(known.record!.revision,'latest-frozen-revision');
 const firstOpen=await reloadTopicShareData(undefined,readers);
 assert.equal(firstOpen.source.fingerprint,'frozen-source');assert.equal(firstOpen.record!.id,'story-one');
});

test('reload reports live read errors instead of treating a server failure as source deletion',async()=>{
 const {reloadTopicShareData}=await clientState();
 const recommendation={column:'inside' as const,evidenceLevel:'analysis' as const,warnings:[],english:{score:51,reason:'Source A.',angle:'Context.'},chinese:{score:49,reason:'旧材料。',angle:'背景。'}};
 const data={source:record.source,recommendation,record};
 await assert.rejects(reloadTopicShareData(data,{live:async()=>{throw Object.assign(new Error('Temporary read failure'),{status:500});},frozen:async()=>data}),/Temporary read failure/);
});
