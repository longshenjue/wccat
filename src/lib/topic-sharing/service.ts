import {getDb} from '../db';
import {guardedWrite,readGeneration} from '../maintenance';
import {loadTopicShareSource,TopicSharingError,withTopicShareComments} from './source';
import {topicShareBaseFingerprint} from './source-identity';
import {visibleCommentQuotes} from '../comments/selection';
import {readTopicShare,persistTopicShare} from './store';
import {generateTopicShare} from './generation';
import {recommendTopic} from './recommendation';
import {EDITORIAL_COLUMNS} from './columns';
import {researchTopicShare} from './research';
import {prepareTopicShareAssets,reuseTopicShareAssets} from './assets';
import type {EditorialColumn,TopicShareRef} from './types';
export {parseTopicShareRef,loadTopicShareSource,TopicSharingError} from './source';
export {readTopicShare,persistTopicShare,saveTopicShareEdits} from './store';

export function topicSharePayload(ref:unknown){const source=loadTopicShareSource(ref);return {source,recommendation:recommendTopic(source),record:readTopicShare(source.sourceKey)};}
export async function generateSavedTopicShare(ref:TopicShareRef,options:{column?:EditorialColumn;force?:boolean;expectedRevision?:string;expectedSourceFingerprint?:string;fetch?:typeof fetch;research?:typeof researchTopicShare;assets?:typeof prepareTopicShareAssets;log?:(level:'info'|'warn'|'error',text:string)=>void}={}){
 const db=getDb(),generation=readGeneration(db),source=loadTopicShareSource(ref),current=readTopicShare(source.sourceKey);
 if(options.expectedSourceFingerprint!==undefined&&options.expectedSourceFingerprint!==source.fingerprint&&!(current&&options.expectedSourceFingerprint===current.source.fingerprint&&topicShareBaseFingerprint(current.source)===source.fingerprint))throw new TopicSharingError('来源内容已更新，请重新载入后生成。',409);
 if(options.column&&!EDITORIAL_COLUMNS.some(item=>item.id===options.column))throw new TopicSharingError('未知的分享栏目。');
 const baseline=current?.revision??'none';
 if(options.expectedRevision!==undefined&&options.expectedRevision!==baseline)throw new TopicSharingError('分享版本已更新，请载入最新版本后生成。',409);
 if(current&&!options.force&&topicShareBaseFingerprint(current.source)===source.fingerprint&&(!options.column||options.column===current.copy.column))return current;
 if(!process.env.DEEPSEEK_API_KEY)throw new TopicSharingError('DEEPSEEK_API_KEY is not configured; existing topic share draft preserved');
 let frozenSource=await (options.research??researchTopicShare)(source,{fetch:options.fetch,log:options.log});
 let analysis=source.analysis;
 const savedExamples=current&&topicShareBaseFingerprint(current.source)===source.fingerprint?current.source.commentExamples:undefined;
 if(analysis&&!visibleCommentQuotes(analysis.commentExamples,analysis.battle,'zh').length&&visibleCommentQuotes(savedExamples,analysis.battle,'zh').length)analysis={...analysis,commentExamples:savedExamples};
 if(analysis?.commentExamples&&JSON.stringify(analysis.commentExamples)!==JSON.stringify(source.commentExamples))frozenSource=withTopicShareComments(frozenSource,analysis);
 // Fresh retrieval is explicit and carries its own observedAt; prior analysis is
 // never a prerequisite for acquiring a source photo or original reader voices.
 frozenSource=await (options.assets??prepareTopicShareAssets)(frozenSource,{log:options.log});
 frozenSource=reuseTopicShareAssets(current?.source,frozenSource);
 const copy=await generateTopicShare(frozenSource,{column:options.column,fetch:options.fetch,log:options.log});
 return guardedWrite(db,()=>{
  if(loadTopicShareSource(source.ref).fingerprint!==source.fingerprint)throw new TopicSharingError('来源内容在生成期间已更新，请重新载入。',409);
  return persistTopicShare(frozenSource,copy,baseline,generation);
 },generation);
}
