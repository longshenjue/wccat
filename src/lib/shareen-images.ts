import type {GenerationLog,WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {shareEnOriginalImage} from './shareen-media';
import {readOwnImage,hasWebpDimensions} from './shareen-image-state';
import {processShareEnImage} from './shareen-image-processor';

type ImageOptions={force?:boolean;topicId?:string;previous?:ShareEnCopy;log?:GenerationLog};

/** Only process the selected cards, one image and at most one vision request at a time. */
export async function prepareShareEnImages(report:WccatDailyReport,copy:ShareEnCopy,options:ImageOptions={}):Promise<ShareEnCopy>{
 const highlights=[...copy.highlights];
 for(let index=0;index<Math.min(highlights.length,3);index++){
  const item=highlights[index];
  if(options.topicId!==undefined&&item.topicId!==options.topicId)continue;
  const original=shareEnOriginalImage(report,copy,index+1);
  const stored=readOwnImage(report,copy,index,options.previous??copy);
  const previous=stored&&await hasWebpDimensions(stored)?stored.asset:undefined;
  let asset=previous;
  if(original){
   const topic=report.topics.find(row=>row.id===item.topicId);
   if(!topic)continue;
   try{
    asset=await processShareEnImage({url:original.url,sourceId:original.sourceId,title:topic.title,previous,force:options.force},options.log)??previous;
    if(asset&&previous&&asset.processedAt===previous.processedAt&&asset.id===previous.id){
     options.log?.('info',`ShareEn 配图沿用缓存（${index+1}）`);
    }
   }catch{
    options.log?.('warn',`ShareEn 配图处理失败（${index+1}），已保留文案和同来源缓存`);
   }
  }else if(options.topicId!==undefined){
   options.log?.('info','该焦点配图已隐藏或没有可用的来源，已跳过');
  }
  if(JSON.stringify(asset)!==JSON.stringify(item.imageAsset)){
   const updated={...item};
   if(asset)updated.imageAsset=asset;
   else delete updated.imageAsset;
   highlights[index]=updated;
  }
 }
 return highlights.some((item,index)=>item!==copy.highlights[index])?{...copy,highlights}:copy;
}
