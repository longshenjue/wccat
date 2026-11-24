import {getDb} from '../db';
import {guardedWrite,readGeneration} from '../maintenance';
import {loadTopicShareSource,TopicSharingError} from './source';
import {readTopicShare,persistTopicShare} from './store';
import {generateTopicShare} from './generation';
import {eligibleColumns,recommendTopic} from './recommendation';
import type {EditorialColumn,TopicShareRef} from './types';
export {parseTopicShareRef,loadTopicShareSource,TopicSharingError} from './source';
export {readTopicShare,persistTopicShare,saveTopicShareEdits} from './store';

export function topicSharePayload(ref:unknown){const source=loadTopicShareSource(ref);return {source,recommendation:recommendTopic(source),record:readTopicShare(source.sourceKey)};}
export async function generateSavedTopicShare(ref:TopicShareRef,options:{column?:EditorialColumn;force?:boolean;expectedRevision?:string;expectedSourceFingerprint?:string;fetch?:typeof fetch;log?:(level:'info'|'warn'|'error',text:string)=>void}={}){
 const db=getDb(),generation=readGeneration(db),source=loadTopicShareSource(ref),current=readTopicShare(source.sourceKey);
 if(options.expectedSourceFingerprint!==undefined&&options.expectedSourceFingerprint!==source.fingerprint)throw new TopicSharingError('来源内容已更新，请重新载入后生成。',409);
 if(options.column&&!eligibleColumns(source).includes(options.column))throw new TopicSharingError('该栏目需要可核实的原始评论，请选择其他栏目。');
 const baseline=current?.revision??'none';
 if(options.expectedRevision!==undefined&&options.expectedRevision!==baseline)throw new TopicSharingError('分享版本已更新，请载入最新版本后生成。',409);
 if(current&&!options.force&&current.source.fingerprint===source.fingerprint&&(!options.column||options.column===current.copy.column))return current;
 const copy=await generateTopicShare(source,{column:options.column,fetch:options.fetch,log:options.log});
 return guardedWrite(db,()=>{
  if(loadTopicShareSource(source.ref).fingerprint!==source.fingerprint)throw new TopicSharingError('来源内容在生成期间已更新，请重新载入。',409);
  return persistTopicShare(source,copy,baseline,generation);
 },generation);
}
