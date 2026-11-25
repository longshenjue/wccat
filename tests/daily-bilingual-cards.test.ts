import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {ShareEnPoster,shareEnCanvasHeight} from '../src/components/shareen-poster';
import {shareEnTextFiles} from '../src/lib/share-export';
import {createStoreZip} from '../src/lib/client-zip';
import type {CommentExamples} from '../src/lib/comments/types';

async function setup(count=4){
 const report=fixture('2026-11-24');
 report.topics=Array.from({length:count},(_,i)=>({...structuredClone(report.topics[0]),id:`native-${i+1}`,rank:i+1,title:`中文原榜话题${i+1}`,oneLine:`话题${i+1}的已保存事件说明。`,whyItMatters:`话题${i+1}的中文相关性说明。`}));
 report.topics[0].cover='https://i0.hdslb.com/bfs/archive/source.jpg';
 const copy=await savedShareEnFixture(report);report.shareEn=copy;
 return {report,copy};
}
const examples:CommentExamples={redLabel:'质疑',blueLabel:'支持',sampleCount:20,sampledAt:'2026-11-24T01:00:00Z',runIds:['run'],red:{id:'zhihu:1',sourceId:'zhihu',sourceName:'知乎',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123',text:'希望先看完整证据再下判断。',likes:12,rank:1,observedAt:'2026-11-24T01:00:00Z'}};

test('Chinese edition uses every native ranked title and the exact English-selected stories',async()=>{
 const {report,copy}=await setup(10);
 copy.highlights=[copy.highlights[2],copy.highlights[0],copy.highlights[1]];
 const overview=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:0,language:'zh'}));
 assert.match(overview,/lang="zh"/);
 for(let i=1;i<=10;i++)assert.ok(overview.includes(`中文原榜话题${i}`));
 assert.match(overview,/今日热点/);assert.doesNotMatch(overview,/Daily story|Daily Hot · China|ORIGINAL DAILY RANKING/);
 const detail=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.match(detail,/中文原榜话题3/);assert.match(detail,/完整分析/);assert.match(detail,/背景说明/);
 assert.match(detail,/原榜 #03/);assert.match(detail,/质疑/);assert.doesNotMatch(detail,/A closer look at the story|WHAT HAPPENED|WHY IT MATTERS|Wait for evidence/);
});

test('native original comments render without English translations; unusable samples occupy no extra canvas',async()=>{
 const {report,copy}=await setup();report.topics[0].aiAnalysis!.commentExamples=examples;
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.match(markup,/希望先看完整证据再下判断/);assert.match(markup,/用户怎么说/);assert.match(markup,/非民调/);
 assert.equal(shareEnCanvasHeight(report,copy,1,'zh'),1900);
 assert.equal(shareEnCanvasHeight(report,copy,1),1500);
 assert.doesNotMatch(markup,/<time|采样于|Sampled at|AI translation/);
 report.topics[0].aiAnalysis!.commentExamples={...examples,red:{...examples.red!,text:''}};
 const missing=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.doesNotMatch(missing,/comment-quotes/);assert.equal(shareEnCanvasHeight(report,copy,1,'zh'),1500);
});

test('Chinese and English cards reuse approved images and the same hide choice',async()=>{
 const {report,copy}=await setup();
 for(const language of ['en','zh'] as const){
  const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language}));
  assert.match(markup,/data-shareen-cover/);assert.match(markup,/source.jpg/);
  if(language==='zh')assert.match(markup,/alt="[^\"]*中文原榜话题1/);
 }
 copy.highlights[0].hideImage=true;
 for(const language of ['en','zh'] as const)assert.doesNotMatch(renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language})),/<figure|data-shareen-cover/);
});

test('Chinese text exports follow the same selected topic order and preserve native comment provenance',async()=>{
 const {report,copy}=await setup();report.topics[0].aiAnalysis!.commentExamples=examples;
 const files=shareEnTextFiles(report,copy,'zh');
 assert.deepEqual(files.map(file=>file.name),['post.txt','alt-text.txt','sources.txt']);
 const [post,alt,sources]=files.map(file=>new TextDecoder().decode(file.data));
 assert.match(post,/中文原榜话题1/);assert.match(post,/中文原榜话题2/);assert.doesNotMatch(post,/A view from China|Original daily story/);
 assert.match(alt,/中文原榜话题1/);assert.match(alt,/希望先看完整证据再下判断/);assert.doesNotMatch(alt,/AI-translated|Debate energy/);
 assert.match(sources,/https:\/\/www.zhihu.com\/question\/123/);assert.match(sources,/zhihu:1/);assert.match(sources,/原文/);assert.match(sources,/非民调/);
 const english=shareEnTextFiles(report,copy);assert.equal(new TextDecoder().decode(english[0].data),copy.posts.find(post=>post.id===copy.selectedPostId)!.text+'\n');
});

test('Chinese preserves two original quotes when only one has an English translation',async()=>{
 const {report,copy}=await setup();
 report.topics[0].aiAnalysis!.commentExamples={...examples,red:{...examples.red!,englishText:'Please wait for complete evidence.'},blue:{...examples.red!,id:'zhihu:2',text:'还需要更多信息才能确认。'}};
 copy.highlights[0].battle={redLabel:'Ask for evidence',blueLabel:'Wait and see',redRationale:'Evidence is still needed.',blueRationale:'Details are still unclear.',redScore:40,blueScore:60,basis:'analysis'};
 assert.equal(shareEnCanvasHeight(report,copy,1,'zh'),2200);assert.equal(shareEnCanvasHeight(report,copy,1,'en'),1900);
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.match(markup,/希望先看完整证据再下判断/);assert.match(markup,/还需要更多信息才能确认/);assert.doesNotMatch(markup,/Ask for evidence|Wait and see|Please wait for complete evidence/);
});

test('bilingual ZIP names keep both editions and their matching captions, ALT and sources distinct',async()=>{
 const {bilingualDailyTextFiles,dailyCardFilename}=await import('../src/lib/share-export');
 const {report,copy}=await setup();
 const names=['en-01-overview.png','en-02-deep-dive.png','en-03-deep-dive.png','en-04-deep-dive.png','zh-01-overview.png','zh-02-deep-dive.png','zh-03-deep-dive.png','zh-04-deep-dive.png'];
 const images=(['en','zh'] as const).flatMap(language=>Array.from({length:4},(_,index)=>({name:dailyCardFilename(index,language),data:new Uint8Array([137,80,78,71])})));
 const files=[...images,...bilingualDailyTextFiles(report,copy)];
 const zip=createStoreZip(files),view=new DataView(zip.buffer);
 const decoded:Array<{name:string;text:string}>=[];let offset=0;
 while(view.getUint32(offset,true)===0x04034b50){
  const size=view.getUint32(offset+18,true),nameSize=view.getUint16(offset+26,true),extraSize=view.getUint16(offset+28,true),start=offset+30+nameSize+extraSize;
  decoded.push({name:new TextDecoder().decode(zip.slice(offset+30,offset+30+nameSize)),text:new TextDecoder().decode(zip.slice(start,start+size))});offset=start+size;
 }
 assert.deepEqual(decoded.map(file=>file.name),[...names,'en-post.txt','en-alt-text.txt','en-sources.txt','zh-post.txt','zh-alt-text.txt','zh-sources.txt']);
 assert.match(decoded.find(file=>file.name==='en-post.txt')!.text,/A view from China/);
 assert.match(decoded.find(file=>file.name==='zh-post.txt')!.text,/中文原榜话题1/);
 assert.match(decoded.find(file=>file.name==='zh-sources.txt')!.text,/统计窗口/);
});

test('native companion refuses mismatched revisions and identities without blocking legacy English rendering',async()=>{
 const {report,copy}=await setup();
 const changed={...copy,sourceFingerprint:'0'.repeat(64)};
 assert.throws(()=>shareEnTextFiles(report,changed,'zh'),/版本不一致/);
 assert.doesNotThrow(()=>shareEnTextFiles(report,changed));
 const wrong={...copy,highlights:[{...copy.highlights[0],topicId:'not-in-this-report'}]};
 assert.throws(()=>renderToStaticMarkup(createElement(ShareEnPoster,{report,copy:wrong,index:1,language:'zh'})),/精选话题/);
 assert.doesNotThrow(()=>renderToStaticMarkup(createElement(ShareEnPoster,{report,copy:wrong,index:1})));
 const reordered={...copy,overview:{...copy.overview,topics:[...copy.overview.topics].reverse()}};
 assert.throws(()=>shareEnTextFiles(report,reordered,'zh'),/来源或顺序/);
});

test('a changed daily report with unchanged topic IDs cannot pair a stale English cache with new Chinese text',async()=>{
 const {report,copy}=await setup();
 const {sharingReportForClient}=await import('../src/lib/shareen-image-state');
 const {sourceFingerprint}=await import('../src/lib/shareen');
 report.topics[0].aiAnalysis!.summary='该事件的来源材料已经更新，中文版本也应随之更新。';
 const client=sharingReportForClient(report);
 assert.throws(()=>shareEnTextFiles(client,copy,'zh'),/版本不一致/);
 assert.doesNotThrow(()=>shareEnTextFiles(client,copy,'en'));
 assert.equal(sourceFingerprint(client),sourceFingerprint(report),'transport metadata cannot change the source identity');
});

test('server projection recomputes its read-only source identity instead of trusting imported metadata',async()=>{
 const {report,copy}=await setup();
 const {sharingReportForClient}=await import('../src/lib/shareen-image-state');
 const {sourceFingerprint}=await import('../src/lib/shareen');
 const imported={...report,sharingSourceFingerprint:'0'.repeat(64)};
 const client=sharingReportForClient(imported);
 assert.equal(client.sharingSourceFingerprint,sourceFingerprint(report));
 assert.doesNotThrow(()=>shareEnTextFiles(client,copy,'zh'));
 assert.equal(imported.sharingSourceFingerprint,'0'.repeat(64),'projection must not write back into saved source data');
 delete imported.shareEn;
 assert.equal(sharingReportForClient(imported).sharingSourceFingerprint,sourceFingerprint(report));
});

test('Chinese overview ALT stays within the image-description limit when source headlines are long',async()=>{
 const {report,copy}=await setup(10);
 for(const topic of report.topics)topic.title='这是一个很长的中文新闻标题'.repeat(25);
 const {sourceFingerprint}=await import('../src/lib/shareen');copy.sourceFingerprint=sourceFingerprint(report);
 const alt=new TextDecoder().decode(shareEnTextFiles(report,copy,'zh').find(file=>file.name==='alt-text.txt')!.data);
 for(const description of alt.trim().split('\n\n'))assert.ok(Array.from(description).length<=1000);
});

test('sparse native companions keep one detail and never pad missing stories',async()=>{
 const {report,copy}=await setup(1);
 const overview=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:0,language:'zh'}));
 assert.match(overview,/热点榜[^<]*1/);assert.match(overview,/\/ 02/);
 const files=shareEnTextFiles(report,copy,'zh');
 assert.match(new TextDecoder().decode(files[0].data),/精选 1 个话题/);
 assert.doesNotMatch(new TextDecoder().decode(files[0].data),/2\. /);
});

test('headline-only saved English highlights do not acquire invented Chinese story details',async()=>{
 const {report,copy}=await setup();const topic=report.topics[0];
 topic.oneLine=topic.title;topic.whyItMatters='';delete topic.aiAnalysis;
 assert.throws(()=>shareEnTextFiles(report,copy,'zh'),/中文说明/);
 assert.doesNotThrow(()=>shareEnTextFiles(report,copy));
});


test('Chinese caption and context use saved native analysis ahead of generic ranking summaries',async()=>{
 const {report,copy}=await setup();
 report.topics[0].oneLine='它在单一平台排名靠前，适合作为该社区当日兴趣与情绪的信号。';
 report.topics[0].whyItMatters=report.topics[0].oneLine;
 report.topics[0].aiAnalysis!.summary='现场回应关注收费调整。';
 report.topics[0].aiAnalysis!.outsiderContext='公共服务收费直接影响居民日常支出。';
 const post=new TextDecoder().decode(shareEnTextFiles(report,copy,'zh')[0].data);
 assert.match(post,/现场回应关注收费调整/);assert.doesNotMatch(post,/单一平台排名靠前/);
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.match(markup,/公共服务收费直接影响居民日常支出/);assert.doesNotMatch(markup,/单一平台排名靠前/);
});

test('a single supported daily story generates a sparse bilingual edition without a padding story',async()=>{
 const {report}=await setup(1);delete report.shareEn;
 const {generateShareEn}=await import('../src/lib/shareen');
 const {shareEnDraft}=await import('./helpers/shareen-fixture');
 const previousFetch=globalThis.fetch,previousKey=process.env.DEEPSEEK_API_KEY;
 process.env.DEEPSEEK_API_KEY='fixture-only';
 globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(shareEnDraft(report))}}]});
 try{
  const copy=await generateShareEn(report,()=>{});assert.ok(copy);
  assert.equal(copy.highlights.length,1);assert.equal(copy.overview.topics.length,1);
  const texts=shareEnTextFiles(report,copy,'zh');assert.match(new TextDecoder().decode(texts[0].data),/精选 1 个话题/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previousKey;}
});

test('both languages retain the exact approved processed asset and full-image split geometry',async()=>{
 const {report,copy}=await setup();
 copy.highlights[0].imageAsset={version:1,id:'a'.repeat(64),requestKey:'b'.repeat(64),sourceHash:'c'.repeat(64),sourceUrl:report.topics[0].cover!,model:'fixture',policyVersion:'shareen-image-v1',layout:'split',width:400,height:480,sourceWidth:1200,sourceHeight:800,protectedRegions:[],confidence:.4,reason:'Source preserved',processedAt:'2026-11-24T00:00:00Z',mime:'image/webp'};
 for(const language of ['en','zh'] as const){
  const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language}));
  assert.match(markup,/\/api\/admin\/share\/image\?date=2026-11-24&amp;topicId=native-1&amp;assetId=aaaaaaaa/);
  assert.match(markup,/grid-template-columns:400px minmax\(0,1fr\)/);assert.match(markup,/translate\(0px, -104px\)/);
 }
});

test('English comment markers expose English accessible labels',async()=>{
 const {CommentQuotes}=await import('../src/components/comment-quotes');
 const markup=renderToStaticMarkup(createElement(CommentQuotes,{examples:{...examples,red:{...examples.red!,englishText:'Please wait for evidence.'}},battle:{redLabel:'质疑',blueLabel:'支持'},language:'en'}));
 assert.match(markup,/aria-label="Red cat attitude marker"/);assert.doesNotMatch(markup,/红色小猫观点标记/);
});

test('native card excerpts use real saved facts when other fields are ranking placeholders',async()=>{
 const {report,copy}=await setup();const topic=report.topics[0];
 topic.oneLine=`${topic.title}正在微博等来源获得注意力。`;
 topic.whyItMatters='原报道说明了社区服务调整的实施范围和具体条件。';
 topic.aiAnalysis!.summary=topic.oneLine;topic.aiAnalysis!.detailedContent=topic.oneLine;
 topic.aiAnalysis!.outsiderContext='对不了解中文互联网的读者来说，这个话题需要结合平台来源理解：搜索热度代表求证需求，社交热度代表情绪扩散，媒体热度代表公共叙事进入。';
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1,language:'zh'}));
 assert.match(markup,/原报道说明了社区服务调整/);assert.doesNotMatch(markup,/获得注意力|搜索热度代表求证需求/);
 const post=new TextDecoder().decode(shareEnTextFiles(report,copy,'zh')[0].data);
 assert.match(post,/原报道说明了社区服务调整/);assert.doesNotMatch(post,/获得注意力/);
});
