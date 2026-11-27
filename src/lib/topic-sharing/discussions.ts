import {resolveCommentThread} from '../comments/adapters';
import {searchResearchSources} from './research/search';
import {eventSourceMatches,extractResearchDocument} from './research/discovery';
import {readPublicResearchText} from './research/public-fetch';
import type {TopicShareSource} from './types';

/** One extra focused search after empty original threads, never a full-comment crawl. */
export async function discoverTopicDiscussions(source:TopicShareSource,signal:AbortSignal){
 let requests=0;const reserve=()=>{if(++requests>8)throw Error('Discussion discovery limit');};
 const hits=await searchResearchSources({query:source.title+' 网友 评论',purpose:'event',language:'zh',date:source.date},{signal,onApiRequest:reserve,read:url=>readPublicResearchText(url,{signal,onRequest:reserve,maxBytes:1_000_000})});
 const found=new Map<string,{sourceId:string;url:string}>();
 let pages=0;
 for(const hit of hits){
  if(!eventSourceMatches(hit.title,hit.snippet,source.title,[],source.title))continue;
  for(const sourceId of ['bilibili','zhihu','weibo','hupu','douban','tieba','thepaper','qq-news','sina-news','netease-news','ithome','huxiu','toutiao']){
   const thread=resolveCommentThread({sourceId,url:hit.url});if(!thread||pages>=3)continue;
   pages++;
   try{
    const response=await readPublicResearchText(hit.url,{signal,onRequest:reserve,maxBytes:1_000_000});
    const doc=extractResearchDocument(response.url,response.text,new Date().toISOString(),'event',{editionDate:source.date,feedPublishedAt:hit.publishedAt});
    if(doc.purpose==='event'&&eventSourceMatches(doc.title,doc.text,source.title,[],source.title))found.set(thread.key,{sourceId:thread.sourceId,url:thread.articleUrl});
   }catch{/* A search snippet alone is not enough to attach a thread to this event. */}
   break;
  }
 }
 return [...found.values()].slice(0,6);
}
