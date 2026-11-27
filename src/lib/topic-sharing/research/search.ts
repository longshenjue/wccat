import {parseEncyclopediaSearch,parseSearchFeed} from './discovery';
import {readResearchResponseText,safeResearchUrl} from './public-fetch';
import type {ResearchHit,ResearchQuery,ResearchRead} from './types';

type Options={read:(url:string)=>Promise<ResearchRead>;fetch?:typeof fetch;signal:AbortSignal;onApiRequest:()=>void};
/** Fixed discovery endpoints only. A configured API is optional; public fallbacks do not require credentials. */
export async function searchResearchSources(query:ResearchQuery,options:Options):Promise<ResearchHit[]>{
 const key=process.env.BRAVE_SEARCH_API_KEY;
 if(key){
  try{
   options.onApiRequest();const signal=AbortSignal.any([options.signal,AbortSignal.timeout(8000)]);
   const response=await (options.fetch??fetch)(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.query)}&count=8`,{redirect:'error',signal,headers:{accept:'application/json','X-Subscription-Token':key}});
   if(!response.ok){await response.body?.cancel();throw new Error('Search API unavailable');}
   const data=JSON.parse(await readResearchResponseText(response,signal,200_000)) as {web?:{results?:Array<{url:string;title:string;description?:string}>}};
   const hits=(data.web?.results??[]).slice(0,8).flatMap(hit=>{try{return [{title:hit.title,url:safeResearchUrl(hit.url).href,snippet:hit.description??''}];}catch{return [];}});
   if(hits.length)return hits;
  }catch{/* No credentials, headers or provider response bodies are written into logs. */}
 }
 if(query.purpose==='background'||query.provider==='encyclopedia')return parseEncyclopediaSearch((await options.read(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=${encodeURIComponent(query.query)}`)).text);
 const hits=parseSearchFeed((await options.read(`https://www.bing.com/news/search?format=rss&mkt=en-US&q=${encodeURIComponent(query.query)}`)).text);
 if(hits.length)return hits;
 return parseEncyclopediaSearch((await options.read(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=${encodeURIComponent(query.query)}`)).text);
}
