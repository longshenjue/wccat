import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {getDb} from '../db';
import {CommentCollector} from '../comments/collector';
import {CommentClassifier} from '../comments/classifier';
import {resolveCommentThread} from '../comments/adapters';
import {discoverTopicDiscussions} from './discussions';
import {withTopicShareAssets} from './source';
import {topicShareBaseFingerprint} from './source-identity';
import {topicReaderComments} from './readers';
import {readPublicResearchImage,safeResearchUrl} from './research/public-fetch';
import type {CommentSample} from '../comments/types';
import type {TopicReaderComment,TopicShareSource} from './types';
type Log=(level:'info'|'warn'|'error',message:string)=>void;
type ThreadLink={sourceId:string;url:string};
type Options={log?:Log;readImage?:(url:string)=>Promise<Buffer>;collect?:(links:ThreadLink[],maxThreads?:number)=>Promise<CommentSample>;discover?:typeof discoverTopicDiscussions};

/** Explicit generation only. Assets are frozen with the draft, never found during preview/export. */
export async function prepareTopicShareAssets(source:TopicShareSource,options:Options={}):Promise<TopicShareSource>{
 const warnings:string[]=[],signal=AbortSignal.timeout(45000);let photo=source.photo;
 const candidates=[...(source.cover&&source.coverAttribution?[{url:source.cover,...source.coverAttribution}]:[]),...(source.research?.imageCandidates??[])];
 for(const image of candidates.slice(0,3)){
  if(photo||signal.aborted)break;
  try{
   const url=safeResearchUrl(image.url);if(/(?:^|\.)pollinations\.ai$/.test(url.hostname))continue;
   const input=await (options.readImage??(url=>readPublicResearchImage(url,{signal})))(url.href);
   if(input.length>4_000_000)throw Error('image limit');
   const pipeline=sharp(input,{limitInputPixels:20_000_000,animated:false}),meta=await pipeline.metadata();
   if(!meta.width||!meta.height||meta.width<320||meta.height<180||(meta.pages??1)>1)throw Error('not a useful news image');
   const output=await pipeline.rotate().resize({width:1200,height:900,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer({resolveWithObject:true});
   if(output.data.length>512_000)throw Error('prepared image limit');
   photo={id:createHash('sha256').update(output.data).digest('hex'),sourceUrl:url.href,pageUrl:image.pageUrl,publisher:image.publisher,width:output.info.width,height:output.info.height,dataBase64:output.data.toString('base64')};
   options.log?.('info',`已保存新闻配图：${image.publisher} · ${photo.width}×${photo.height}`);
  }catch{warnings.push('一张原始新闻图片未能读取，已尝试下一来源。');}
 }
 let readerComments:TopicReaderComment[]=source.readerComments??[],analysis=source.analysis,commentExamples=source.commentExamples??analysis?.commentExamples;
 const candidatesForComments=[...(source.research?.threadCandidates??[]),...source.links].slice(0,30);
 const threads=new Map<string,ThreadLink>();
 for(const link of candidatesForComments){const thread=resolveCommentThread(link);if(thread)threads.set(thread.key,link);}
 const links=[...threads.values()].slice(0,6);
 if(process.env.WCCAT_COMMENTS_ENABLED!=='false'&&process.env.WCCAT_COMMENTS_ENABLED!=='0'){
  try{
   const collect=(items:Array<{sourceId:string;url:string}>,maxThreads=6)=>new CommentCollector(getDb(),{maxThreads,dailyLimit:Number(process.env.WCCAT_COMMENT_DAILY_LIMIT??100),log:options.log,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])})}).collect(items);
   let sample=await (options.collect??collect)(links,6);
   const attempted=new Set(links.map(link=>resolveCommentThread(link)!.key));
   if(!sample.comments.length&&(options.discover||!options.collect)&&source.research?.queries.length&&attempted.size<6&&!signal.aborted){
    options.log?.('info','已有原帖未取得评论，正在限量补搜同一话题的其他讨论入口。');
    try{
     const extra=(await (options.discover??discoverTopicDiscussions)(source,signal)).filter(link=>{const thread=resolveCommentThread(link);if(!thread||attempted.has(thread.key))return false;attempted.add(thread.key);return true;}).slice(0,6-links.length);
     if(extra.length)sample=await (options.collect??collect)(extra,6-links.length);
     else warnings.push('已补搜其他讨论入口，本轮未找到可采集的同话题原帖。');
    }catch{warnings.push('其他讨论入口补搜未完成，已保留现有正文和配图。');}
   }
   if(sample.comments.length){
    if(!options.collect){
     const battle=analysis?.battle??{redLabel:'支持或认可',blueLabel:'质疑或担忧'};
     commentExamples=await new CommentClassifier(getDb(),{log:options.log}).classify(sample,battle,source.title)??commentExamples;
     if(analysis&&commentExamples)analysis={...analysis,commentExamples};
    }
    const selected=[commentExamples?.red,commentExamples?.blue].filter(Boolean) as TopicReaderComment[];
    const sorted=[...sample.comments].sort((a,b)=>(b.likes??-1)-(a.likes??-1)||a.rank-b.rank);
    const translated=new Map(selected.map(quote=>[quote.id,quote]));
    readerComments=[...new Map([...selected,...sorted].map(quote=>[quote.id,translated.get(quote.id)??quote])).values()].slice(0,2).map(quote=>({...quote,...(commentExamples?.red?.id===quote.id?{side:'red' as const}:commentExamples?.blue?.id===quote.id?{side:'blue' as const}:{})}));
    options.log?.('info',`已保存 ${readerComments.length} 条真实网友原话；未匹配红蓝分类的原话仍保留。`);
   }
  }catch{warnings.push('评论采集未完成，已有真实评论继续保留。');}
 }
 if(!photo)warnings.push('未取得可用新闻图片，尚未满足单话题发布要求。');
 if(!readerComments.length&&!commentExamples?.red&&!commentExamples?.blue)warnings.push('未取得真实网友评论，尚未满足单话题发布要求。');
 return withTopicShareAssets(source,{photo,readerComments,assetWarnings:warnings,analysis,commentExamples});
}

/** A transient upstream failure must not erase already verified same-source assets. */
export function reuseTopicShareAssets(previous:TopicShareSource|undefined,fresh:TopicShareSource):TopicShareSource {
 if(!previous||topicShareBaseFingerprint(previous)!==topicShareBaseFingerprint(fresh))return fresh;
 const photo=fresh.photo??previous.photo,readerComments=topicReaderComments(fresh).length?fresh.readerComments:topicReaderComments(previous);
 return withTopicShareAssets(fresh,{photo,readerComments,analysis:fresh.analysis,commentExamples:fresh.commentExamples??previous.commentExamples,assetWarnings:fresh.assetWarnings?.filter(warning=>!(photo&&warning.startsWith('未取得可用新闻图片'))&&!(readerComments?.length&&warning.startsWith('未取得真实网友评论')))});
}
