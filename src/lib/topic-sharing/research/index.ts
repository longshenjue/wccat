import {newsroomPrompt} from '../../newsroom/prompts';
import {parseShareEnJson} from '../../shareen-json';
import {withTopicShareResearch} from '../source';
import type {TopicShareSource} from '../types';
import {readPublicResearchText,safeResearchUrl} from './public-fetch';
import {extractResearchDocument,primarySourceLinks,researchRelevance,researchImages,eventSourceMatches} from './discovery';
import {resolveCommentThread} from '../../comments/adapters';
import {searchResearchSources} from './search';
import type {ResearchHit,ResearchPlan,ResearchQuery,ResearchRead,TopicResearch} from './types';

type Log=(level:'info'|'warn'|'error',message:string)=>void;
type Options={fetch?:typeof fetch;log?:Log;now?:()=>number;plan?:(source:TopicShareSource)=>Promise<ResearchPlan>;search?:(query:ResearchQuery)=>Promise<ResearchHit[]>;read?:(url:string)=>Promise<ResearchRead>};
function parsePlan(value:unknown):ResearchPlan{
 const data=value as {questions?:unknown;queries?:unknown;anchors?:unknown};
 if(!data||!Array.isArray(data.queries))throw new Error('Missing research queries');
 const queries=data.queries.slice(0,3).flatMap(row=>row&&typeof row.query==='string'&&row.query.trim()?[{query:row.query.trim().slice(0,240),purpose:row.purpose==='background'?'background' as const:'event' as const,...(row.language==='zh'||row.language==='en'?{language:row.language as 'zh'|'en'}:{})}]:[]);
 if(!queries.length)throw new Error('Empty research plan');
 return {questions:Array.isArray(data.questions)?data.questions.filter((q):q is string=>typeof q==='string').slice(0,8).map(q=>q.slice(0,160)):[],queries,anchors:Array.isArray(data.anchors)?data.anchors.filter((q):q is string=>typeof q==='string'&&q.trim().length>=3).slice(0,6).map(q=>q.trim().slice(0,80)):[]};
}
async function makePlan(source:TopicShareSource,options:Options):Promise<ResearchPlan>{
 if(options.plan)return parsePlan(await options.plan(source));
 const key=process.env.DEEPSEEK_API_KEY;if(!key)throw new Error('No query planner');
 const response=await (options.fetch??fetch)('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model:process.env.DEEPSEEK_MODEL??'deepseek-flash',thinking:{type:'disabled'},response_format:{type:'json_object'},temperature:0.1,max_tokens:900,messages:[{role:'system',content:newsroomPrompt('research')},{role:'user',content:JSON.stringify({reportDate:source.date,asOf:new Date().toISOString(),title:source.title,summary:source.summary,detail:source.detail.slice(0,1800),context:source.context.slice(0,800)})}]})});
 if(!response.ok)throw new Error('Research planner unavailable');
 const body=await response.json() as {choices?:Array<{message?:{content?:string}}>};return parsePlan(parseShareEnJson(body.choices?.[0]?.message?.content??''));
}

/** Runs only for explicit generation; retrieved bodies remain in the private frozen source. */
export async function researchTopicShare(source:TopicShareSource,options:Options={}):Promise<TopicShareSource>{
 const checkedAt=new Date((options.now??Date.now)()).toISOString();
 const pack:TopicResearch={policy:'news-research-v1',checkedAt,status:'unavailable',questions:[],queries:[],documents:[],warnings:[],imageCandidates:[],threadCandidates:[]};
 if(process.env.WCCAT_TOPIC_RESEARCH_ENABLED==='false'){pack.warnings.push('主动查询已在服务器配置中关闭。');return withTopicShareResearch(source,pack);}
 const signal=AbortSignal.timeout(60000);let requests=0;
 const reserveRequest=()=>{if(++requests>20)throw new Error('Research request limit');};
 const read=options.read?async(url:string)=>{reserveRequest();return options.read!(url);}:((url:string)=>readPublicResearchText(url,{signal,maxBytes:1_000_000,onRequest:reserveRequest}));
 let plan:ResearchPlan;
 try{reserveRequest();plan=await makePlan(source,options);}catch{plan={questions:[],queries:[{query:source.title.slice(0,220),purpose:'event'}]};pack.warnings.push('检索规划未完成，已用原始标题继续查询。');}
 // Preserve the actual original-language headline; a planner's broad English
 // translation must never become our only attempt to find this day's event.
 const events=plan.queries.filter(query=>query.purpose==='event');
 const international=events.find(query=>query.language==='en'||/[a-z]{3}/i.test(query.query)&&!/\p{Script=Han}/u.test(query.query))??events[0];
 plan.queries=[{query:`${source.title} ${source.date}`,purpose:'event',language:/\p{Script=Han}/u.test(source.title)?'zh':'en',date:source.date},...(international?[{...international,date:source.date}]:[]),...plan.queries.filter(query=>query.purpose==='background').slice(0,1)];
 pack.questions=plan.questions;pack.queries=plan.queries;
 const anchors=(plan.anchors?.length?plan.anchors:plan.queries.flatMap(query=>query.query.match(/[\p{L}][\p{L}\p{N}-]{3,}/gu)??[])).filter(word=>!/^(?:army|epa|dnr|lead|government|military|news|official|update|latest|what|when|with|from|this|that|美国|政府|陆军|环境|安全)$/i.test(word));
 options.log?.('info',`主动补充查询：${plan.queries.length} 个查询，最多读取 6 篇正文。`);
 const candidates:Array<{url:string;purpose:'event'|'background';anchors?:string[];publishedAt?:string;query?:string}>=source.links.slice(0,2).filter(link=>!/(?:baidu\.com\/s\?|s\.weibo\.com|\/search[/?]|\/hot\/)/i.test(link.url)).map(link=>({url:link.url,purpose:'event'}));
 for(const query of plan.queries){
  if(signal.aborted)break;
  try{
   if(options.search)reserveRequest();
   const hits=options.search?await options.search(query):await searchResearchSources(query,{read,fetch:options.fetch,signal,onApiRequest:reserveRequest});
   options.log?.('info',`查询「${query.query}」返回 ${hits.length} 条候选。`);
   // Favor original agencies over aggregators while preserving provider order otherwise.
   const sorted=[...hits].sort((a,b)=>Number(/\.(gov|mil|int)\//i.test(b.url))-Number(/\.(gov|mil|int)\//i.test(a.url)));
   const words=query.query.match(/[a-z][a-z-]{3,}/gi)?.filter(word=>!/^(?:after|before|latest|official|news|november|december|january|february|march|april|june|july|august|september|october)$/i.test(word))??[];
   const terms=query.purpose==='background'?(query.query.match(/[\p{L}][\p{L}\p{N}-]{3,}/gu)??[]):query.language==='zh'?[source.title.replace(/如何看待|原因|为什么|[？?]/gu,''),...anchors]:query.language==='en'||!/\p{Script=Han}/u.test(query.query)?words:anchors;
   const relevant=sorted.filter(hit=>query.purpose==='background'||eventSourceMatches(hit.title,hit.snippet,source.title,anchors,query.query));
   candidates.push(...relevant.slice(0,4).map(hit=>({url:hit.url,purpose:query.purpose,anchors:terms,publishedAt:hit.publishedAt,query:query.query})));
  }catch{pack.warnings.push(`查询未成功：${query.query}`);}
 }
 const seen=new Set<string>();let pages=0;
 const priority=(url:string)=>/\.(?:gov|mil|int)\//i.test(url)?20:/\bwikipedia\.org\//i.test(url)?-10:/\b(?:msn|youtube|facebook|reddit)\.com\//i.test(url)?0:10;
 candidates.sort((a,b)=>priority(b.url)-priority(a.url));
 const hostAttempts=new Map<string,number>();
 for(let index=0;index<candidates.length&&pages<9&&pack.documents.length<6&&!signal.aborted;index++){
  const candidate=candidates[index];let url:string;
  try{url=safeResearchUrl(candidate.url).href;}catch{continue;}
  // Do not turn gated pages into invented article text or bypass their access controls.
  const host=new URL(url).hostname,attempts=hostAttempts.get(host)??0;
  if(seen.has(url)||host==='mp.weixin.qq.com'||new URL(url).pathname==='/'||/\/(?:newsroom|search|environmental-topics|topics)\/?$/i.test(new URL(url).pathname)||attempts>=2)continue;seen.add(url);pages++;hostAttempts.set(host,attempts+1);
  try{
   const response=await read(url),document=extractResearchDocument(response.url,response.text,checkedAt,candidate.purpose,{editionDate:source.date,feedPublishedAt:candidate.publishedAt});
   if(candidate.purpose==='event'&&!eventSourceMatches(document.title,document.text,source.title,anchors,candidate.query))throw new Error('Article is not about the research topic');
   const terms=candidate.anchors??anchors;
   if(candidate.purpose==='background'&&terms.length&&!researchRelevance(document.title+' '+document.text,terms))throw new Error('Article is not about the research topic');
   if(!pack.documents.some(old=>old.url===document.url))pack.documents.push(document);
   if(document.purpose==='event'){
    pack.imageCandidates!.push(...researchImages(response.text,response.url,document.publisher));
    for(const sourceId of ['bilibili','zhihu','weibo','hupu','douban','tieba','thepaper','qq-news','sina-news','netease-news','ithome','huxiu','toutiao']){const thread=resolveCommentThread({sourceId,url:document.url});if(thread&&!pack.threadCandidates!.some(row=>row.url===thread.articleUrl))pack.threadCandidates!.push({sourceId:thread.sourceId,sourceName:thread.sourceName,title:document.title,url:thread.articleUrl});}
   }
   options.log?.('info',`已读取正文：${document.publisher} · ${document.title}`);
   candidates.splice(index+1,0,...primarySourceLinks(response.text,response.url,terms).filter(link=>!seen.has(link)).map(link=>({url:link,purpose:candidate.purpose,anchors:terms,query:candidate.query})));
  }catch(error){
   const message=error instanceof Error?error.message:'';
   const reason=/HTTP \d{3}/.exec(message)?.[0]??(/body limit/.test(message)?'页面超过大小上限':/not about/.test(message)?'正文与主题不匹配':/request limit/.test(message)?'达到本次请求上限':/redirect limit/.test(message)?'跳转超过上限':/verification|usable research/.test(message)?'验证页或无可用正文':/timeout|abort/i.test(message)?'读取超时':'网络或格式异常');
   pack.warnings.push(`未读取正文：${new URL(url).hostname}（${reason}）`);
  }
 }
 pack.documents.sort((a,b)=>Number(b.purpose==='event')-Number(a.purpose==='event')||(Date.parse(b.publishedAt??'')||0)-(Date.parse(a.publishedAt??'')||0));
 if(!pack.documents.some(doc=>doc.purpose==='event'))pack.warnings.push('未取得当前事件正文；历史背景不能替代当日报道，稿件需继续补齐事实。');
 pack.status=pack.documents.some(doc=>doc.purpose==='event')?(pack.warnings.length?'partial':'ready'):'unavailable';
 if(!pack.documents.length)pack.warnings.push('本次未取得可读取的补充正文；请人工补充或稍后重试。正文仍可生成，此提示仅在后台显示。');
 options.log?.(pack.documents.length?'info':'warn',`补充查询结束：保存 ${pack.documents.length} 篇正文，${pack.warnings.length} 条后台提示。`);
 return withTopicShareResearch(source,pack);
}
