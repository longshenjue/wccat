import sharp from 'sharp';
import {createHash} from 'node:crypto';
import type {WccatDailyReport} from './daily-report';
import {getValidShareEn,sourceFingerprint} from './shareen';
import type {DailyCardSource} from './daily-bilingual-cards';
import {shareEnOriginalImage} from './shareen-media';
import {validateImageAsset,type ShareEnImageAsset} from './shareen-image-types';
import type {ShareEnCopy} from './shareen-types';

/** Hidden cards retain their saved asset so it can be shown again without regeneration. */
function sourceIncludingHidden(report:WccatDailyReport,copy:ShareEnCopy,index:number){
 const item=copy.highlights[index];
 if(!item)return undefined;
 return shareEnOriginalImage(report,{...copy,highlights:[{...item,hideImage:false}]},1)?.url;
}

type StoredImage={asset:ShareEnImageAsset;bytes:Buffer};

/** Resolve server-owned bytes by topic and source; an asset id alone is insufficient. */
export function readOwnImage(report:WccatDailyReport,copy:ShareEnCopy,index:number,previous?:ShareEnCopy,previousReport=report):StoredImage|undefined {
 const original=sourceIncludingHidden(report,copy,index);
 const previousIndex=previous?.highlights.findIndex(row=>row.topicId===copy.highlights[index].topicId)??-1;
 if(!original||!previous||previousIndex<0||sourceIncludingHidden(previousReport,previous,previousIndex)!==original)return undefined;
 const stored=storedImage(previous.highlights[previousIndex].imageAsset);
 return stored?.asset.sourceUrl===original?stored:undefined;
}

function storedImage(value:unknown):StoredImage|undefined {
 const asset=validateImageAsset(value);
 if(!asset?.dataBase64)return undefined;
 const bytes=Buffer.from(asset.dataBase64,'base64');
 if(createHash('sha256').update(bytes).digest('hex')!==asset.id)return undefined;
 return {asset,bytes};
}

/** Called after processing. A hidden or absent source does not require a cached image. */
export function shareEnImagesReady(report:WccatDailyReport,topicId?:string){
 const copy=getValidShareEn(report);
 return !!copy&&copy.highlights.every((item,index)=>
  (topicId!==undefined&&item.topicId!==topicId)||!shareEnOriginalImage(report,copy,index+1)||!!readOwnImage(report,copy,index,copy));
}

/** Imported files may have correct hashes and incorrect format or dimension metadata. */
export async function hasWebpDimensions({asset,bytes}:StoredImage){
 const meta=await sharp(bytes,{limitInputPixels:asset.width*asset.height}).metadata().catch(()=>undefined);
 return meta?.format==='webp'&&meta.width===asset.width&&meta.height===asset.height&&(meta.pages??1)===1;
}

/** A client can echo or omit its asset id. All persisted metadata and bytes come from this topic's server revision. */
export function restoreImageAssets(report:WccatDailyReport,copy:ShareEnCopy,previous?:ShareEnCopy,options:{submitted?:ShareEnCopy;previousReport?:WccatDailyReport}={}):ShareEnCopy {
 const highlights=copy.highlights.map((item,index)=>{
  const asset=readOwnImage(report,copy,index,previous,options.previousReport)?.asset;
  const claim=options.submitted?.highlights[index]?.imageAsset;
  if(claim!==undefined){
   const baseline=previous?.highlights.find(row=>row.topicId===item.topicId)?.imageAsset;
   if(!baseline||!claim||claim.id!==baseline.id||(claim.dataBase64!==undefined&&claim.dataBase64!==baseline.dataBase64)){
    throw new Error('配图版本无效，请重新载入已保存的分享稿。');
   }
  }
  const restored={...item};
  if(asset)restored.imageAsset=asset;
  else delete restored.imageAsset;
  return restored;
 });
 return {...copy,highlights};
}

/** Carry manual choices only to reselected topic IDs; validate the cache against both daily revisions. */
export function restoreGeneratedImages(report:WccatDailyReport,copy:ShareEnCopy,previousReport:WccatDailyReport|null){
 if(!previousReport||previousReport.reportDate!==report.reportDate)return copy;
 const previous=getValidShareEn(previousReport);
 if(!previous)return copy;
 const highlights=copy.highlights.map(item=>{
  const saved=previous.highlights.find(row=>row.topicId===item.topicId);
  return saved?{...item,imageUrl:saved.imageUrl,hideImage:saved.hideImage}:item;
 });
 return restoreImageAssets(report,{...copy,highlights},previous,{previousReport});
}

export function sharingReportForClient(report:WccatDailyReport):DailyCardSource {
 const sharingSourceFingerprint=sourceFingerprint(report);
 if(!report.shareEn)return {...report,sharingSourceFingerprint};
 // Also redact malformed optional caches in legacy / imported JSON.
 const shareEn=JSON.parse(JSON.stringify(report.shareEn,(key,value)=>{
  if(key==='imageAsset')return storedImage(value)?.asset;
  return key==='dataBase64'?undefined:value;
 })) as ShareEnCopy;
 return {...report,shareEn,sharingSourceFingerprint};
}
