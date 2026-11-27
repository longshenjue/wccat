import {parseEncyclopediaSearch,parseSearchFeed} from './discovery';
import {readResearchResponseText,safeResearchUrl} from './public-fetch';
import type {ResearchHit,ResearchQuery,ResearchRead} from './types';

type Options={read:(url:string)=>Promise<ResearchRead>;fetch?:typeof fetch;signal:AbortSignal;onApiRequest:()=>void};
/** Fixed discovery endpoints only. A configured API is optional; public fallbacks do not require credentials. */
export async function searchResearchSources(query:ResearchQuery,options:Options):Promise<ResearchHit[]>{
 const terms=query.query.replace(/(?:是什么原因|原因是什么|怎么回事|原因)(?=\s|$)/gu,'').replace(/([A-Za-z]+股)(?=\p{Script=Han})/gu,'$1 ').trim();
 const queryText=terms+(query.date&&!terms.includes(query.date)?' '+query.date:'');
 let apiHits:ResearchHit[]=[];
 const key=process.env.BRAVE_SEARCH_API_KEY;
 if(key){
  try{
   options.onApiRequest();const signal=AbortSignal.any([options.signal,AbortSignal.timeout(8000)]);
   const response=await (options.fetch??fetch)(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(queryText)}&count=8`,{redirect:'error',signal,headers:{accept:'application/json','X-Subscription-Token':key}});
   if(!response.ok){await response.body?.cancel();throw new Error('Search API unavailable');}
   const data=JSON.parse(await readResearchResponseText(response,signal,200_000)) as {web?:{results?:Array<{url:string;title:string;description?:string}>}};
   const hits=(data.web?.results??[]).slice(0,8).flatMap(hit=>{try{return [{title:hit.title,url:safeResearchUrl(hit.url).href,snippet:hit.description??''}];}catch{return [];}});
   if(query.purpose==='background'&&hits.length)return hits;
   apiHits=hits;
  }catch{/* No credentials, headers or provider response bodies are written into logs. */}
 }
 if(query.purpose==='background')return parseEncyclopediaSearch((await options.read(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=${encodeURIComponent(query.query)}`)).text);
 const zh=query.language==='zh'||/\p{Script=Han}/u.test(query.query);
 const current=(hits:ResearchHit[])=>hits.filter(hit=>!query.date||!hit.publishedAt||(Date.parse(hit.publishedAt)>=Date.parse(query.date)-3*86400_000&&Date.parse(hit.publishedAt)<Date.parse(query.date)+2*86400_000));
 // Google supplies an independent current-news index. Opaque aggregator links
 // are never mistaken for publisher bodies; match its headlines to direct URLs.
 const locale=zh?'hl=zh-CN&gl=CN&ceid=CN:zh-Hans':'hl=en-US&gl=US&ceid=US:en';
 const urls=[`https://news.google.com/rss/search?${locale}&q=${encodeURIComponent(queryText)}`,...(zh?['zh-CN','en-US']:['en-US','en-GB']).map(market=>`https://www.bing.com/news/search?format=rss&mkt=${market}&q=${encodeURIComponent(queryText)}`)];
 // Independent feeds share one time/request budget. Serial failed searches must
 // not consume the entire minute before any publisher body can be read.
 const results=await Promise.allSettled(urls.map(async url=>current(parseSearchFeed((await options.read(url)).text))));
 const google=results[0].status==='fulfilled'?results[0].value:[];
 const combined=[...apiHits,...results.slice(1).flatMap(result=>result.status==='fulfilled'?result.value:[])];
 const headlineKey=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 return [...new Map([...combined,...google.filter(hit=>new URL(hit.url).hostname!=='news.google.com')].map(hit=>[hit.url,hit])).values()].sort((a,b)=>Number(google.some(hit=>headlineKey(hit.title).includes(headlineKey(b.title))))-Number(google.some(hit=>headlineKey(hit.title).includes(headlineKey(a.title))))||(Date.parse(b.publishedAt??'')||0)-(Date.parse(a.publishedAt??'')||0)).slice(0,12);
}
