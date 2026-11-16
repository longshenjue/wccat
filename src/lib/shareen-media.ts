import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {parseShareEnImageUrl} from './image-proxy';
import {SPLIT_IMAGE,validateImageAsset,type ShareEnImageAsset} from './shareen-image-types';

export type SplitImageDisplay={width:number;height:number;left:number;top:number};
export type ShareEnImage={url:string;src:string;alt:string;layout:'wide'|'split';processed:boolean;display?:SplitImageDisplay};
/** Resolve the approved original independently of optional cached metadata. */
export function shareEnOriginalImage(report:WccatDailyReport,copy:ShareEnCopy,index:number):{url:string;sourceId:string;alt:string}|undefined {
 const highlight=copy.highlights[index-1];if(!highlight||highlight.hideImage)return undefined;
 const topic=report.topics.find(t=>t.id===highlight.topicId);
 const raw=highlight.imageUrl?.trim()||topic?.cover;if(!raw)return undefined;
 try{
  const alt=`Source image for ${highlight.hook}`;
  if(!highlight.imageUrl?.trim()&&raw.startsWith('/api/image?')){
   const proxy=new URL(raw,'http://localhost');
   return {url:parseShareEnImageUrl(proxy.searchParams.get('url')??'').href,sourceId:proxy.searchParams.get('source')??topic?.coverSourceId??'ai',alt};
  }
  return {url:parseShareEnImageUrl(raw).href,sourceId:topic?.coverSourceId??'ai',alt};
 }catch{return undefined;}
}

/** Trim only fit-contain padding; rounding outward and 2px safety preserve all source pixels. */
export function shareEnSplitDisplay(asset:Pick<ShareEnImageAsset,'sourceWidth'|'sourceHeight'>):SplitImageDisplay {
 const {width,height}=SPLIT_IMAGE;
 if(!Number.isFinite(asset.sourceWidth)||!Number.isFinite(asset.sourceHeight)||asset.sourceWidth<=0||asset.sourceHeight<=0)return {width,height,left:0,top:0};
 const scale=Math.min(width/asset.sourceWidth,height/asset.sourceHeight);
 const left=Math.max(0,Math.floor((width-asset.sourceWidth*scale)/2)-2);
 const top=Math.max(0,Math.floor((height-asset.sourceHeight*scale)/2)-2);
 return {width:width-left*2,height:height-top*2,left,top};
}

/** Browser-safe cache selection. Never return private image bytes or trust an asset-provided URL. */
export function shareEnImage(report:WccatDailyReport,copy:ShareEnCopy,index:number):ShareEnImage|undefined {
 const original=shareEnOriginalImage(report,copy,index);if(!original)return undefined;
 const highlight=copy.highlights[index-1];
 const asset=validateImageAsset(highlight.imageAsset);
 if(asset&&parseShareEnImageUrl(asset.sourceUrl).href===original.url){
  return {url:original.url,alt:original.alt,src:`/api/admin/share/image?date=${encodeURIComponent(report.reportDate)}&topicId=${encodeURIComponent(highlight.topicId)}&assetId=${encodeURIComponent(asset.id)}`,layout:asset.layout,processed:true,...(asset.layout==='split'?{display:shareEnSplitDisplay(asset)}:{})};
 }
 return {url:original.url,alt:original.alt,src:`/api/image?source=${encodeURIComponent(original.sourceId)}&url=${encodeURIComponent(original.url)}&mode=shareen`,layout:'wide',processed:false};
}
