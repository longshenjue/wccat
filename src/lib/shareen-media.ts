import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {parseAllowedImageUrl} from './image-proxy';

export type ShareEnImage={url:string;src:string;alt:string};
/** Browser-safe URL resolution. Proxy allowlisting applies equally to original and edited covers. */
export function shareEnImage(report:WccatDailyReport,copy:ShareEnCopy,index:number):ShareEnImage|undefined {
 const highlight=copy.highlights[index-1];if(!highlight||highlight.hideImage)return undefined;
 const topic=report.topics.find(t=>t.id===highlight.topicId);
 const raw=highlight.imageUrl?.trim()||topic?.cover;if(!raw)return undefined;
 try{
  const alt=`Source image for ${highlight.hook}`;
  if(!highlight.imageUrl&&raw.startsWith('/api/image?')){
   const proxy=new URL(raw,'http://localhost');
   const url=parseAllowedImageUrl(proxy.searchParams.get('url')??'').href;
   const source=proxy.searchParams.get('source')??topic?.coverSourceId??'ai';
   return {url,src:`/api/image?source=${encodeURIComponent(source)}&url=${encodeURIComponent(url)}`,alt};
  }
  const url=parseAllowedImageUrl(raw).href;
  return {url,src:`/api/image?source=${encodeURIComponent(topic?.coverSourceId??'ai')}&url=${encodeURIComponent(url)}`,alt};
 }catch{return undefined;}
}
