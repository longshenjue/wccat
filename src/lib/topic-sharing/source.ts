import {createHash} from 'node:crypto';
import {browseDate,browseItem,dailyBrowse,BrowseError} from '../admin-browse';
import {sanitizeEvidence} from '../evidence-content';
import type {TopicGroup,RawHotItem} from '../types';
import type {TopicAnalysis} from '../topic-analysis';
import type {TopicShareRef,TopicShareSource,TopicShareLink} from './types';
import {relatedDevelopmentText,dailyStoryLinks} from '../daily-story-selection';
import type {TopicResearch} from './research/types';

export class TopicSharingError extends Error {constructor(message:string,readonly status=400){super(message);}}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max).trim():'';
export const sourceHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function parseTopicShareRef(value:unknown):TopicShareRef {
 const ref=object(value);
 if(ref.kind==='hourly'){
  if(typeof ref.snapshot!=='string'||!/^\d{4}-\d{2}-\d{2}-(?:[01]\d|2[0-3])$/.test(ref.snapshot))throw new TopicSharingError('采样时段无效。');
  browseDate(ref.snapshot.slice(0,10));
  if(typeof ref.version!=='string'||!/^\w{1,128}$/.test(ref.version)||typeof ref.key!=='string'||!/^[tr]:\d{1,20}$/.test(ref.key))throw new TopicSharingError('采样版本或条目标识无效。');
  return {kind:'hourly',snapshot:ref.snapshot,version:ref.version,key:ref.key};
 }
 if(ref.kind==='daily'){
  const date=browseDate(ref.date);
  if(typeof ref.topicId!=='string'||!ref.topicId.trim()||ref.topicId.length>200)throw new TopicSharingError('日报话题标识无效。');
  if(ref.version!==undefined&&(typeof ref.version!=='string'||!/^\w{1,128}$/.test(ref.version)))throw new TopicSharingError('日报版本无效。');
  return {kind:'daily',date,topicId:ref.topicId,...(typeof ref.version==='string'?{version:ref.version}:{})};
 }
 throw new TopicSharingError('请选择小时报或日报中的单个话题。');
}
export function safeTopicLink(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>4096)return;
 try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!/^(?:localhost|127\.|0\.|\[|169\.254\.)/i.test(url.hostname))return url.toString();}catch{return;}
}
function links(values:Array<{sourceId:string;sourceName:string;title:string;url:string}>,limit=20):TopicShareLink[]{
 const unique=new Map<string,TopicShareLink>();
 for(const row of values.slice(0,Math.max(40,limit))){const url=safeTopicLink(row.url);if(url&&!unique.has(url))unique.set(url,{sourceId:text(row.sourceId,100),sourceName:text(row.sourceName,100),title:text(row.title,400),url});if(unique.size===limit)break;}
 return [...unique.values()];
}
function finalize(value:Omit<TopicShareSource,'fingerprint'|'sourceKey'>):TopicShareSource {
 const {ref,...material}=value;
 // A validated SQLite row key is provenance, not an API credential named "key".
 const source={...sanitizeEvidence(material) as typeof material,ref};
 // A quote whose words would be redacted cannot be presented as a literal original.
 if(value.commentExamples&&source.commentExamples){
  for(const side of ['red','blue'] as const)if(value.commentExamples[side]&&sanitizeEvidence(value.commentExamples[side]!.text)!==value.commentExamples[side]!.text)delete source.commentExamples[side];
  if(source.analysis)source.analysis.commentExamples=source.commentExamples;
 }
 return {...source,sourceKey:sourceHash(source.ref),fingerprint:sourceHash(source)};
}
/** Only trusted collectors may extend a frozen source; never modify the original report. */
export function withTopicShareComments(source:TopicShareSource,analysis:TopicAnalysis):TopicShareSource {
 const {fingerprint,sourceKey:_,...material}=source;
 return finalize({...material,baseFingerprint:source.baseFingerprint??fingerprint,analysis,commentExamples:analysis.commentExamples});
}
export function withTopicShareResearch(source:TopicShareSource,research:TopicResearch):TopicShareSource {
 const {fingerprint,sourceKey:_,...material}=source;
 return finalize({...material,baseFingerprint:source.baseFingerprint??fingerprint,research});
}
export function loadTopicShareSource(value:unknown):TopicShareSource {
 const ref=parseTopicShareRef(value);
 try{
  if(ref.kind==='hourly'){
   const detail=browseItem({snapshot:ref.snapshot,version:ref.version,key:ref.key});
   const topic=detail.kind==='topics'?detail.item as TopicGroup:undefined,raw=detail.kind==='raw'?detail.item as RawHotItem:undefined;
   const analysis=detail.analysis;
   return finalize({ref,topicId:topic?.id??ref.key,date:ref.snapshot.slice(0,10),observedAt:detail.snapshot.generatedAt,title:text(detail.item.title,400),
    summary:text(analysis?.summary??topic?.summary.oneLine??raw?.description??detail.item.title,3000),detail:text(analysis?.detailedContent??raw?.description??'',12000),
    context:text(analysis?.outsiderContext??topic?.summary.context??'',5000),categories:topic?.categories??(raw?[raw.sourceCategory]:[]),rank:detail.item.rank,
    signal:topic?.signal??'new',links:links(topic?.occurrences??(raw?[raw]:[])),analysis,commentExamples:analysis?.commentExamples,cover:safeTopicLink(raw?.cover??topic?.occurrences.find(o=>o.cover)?.cover)});
  }
  const result=dailyBrowse(ref.date);
  if(!result.report||!result.version)throw new TopicSharingError('该日期没有已保存日报。',404);
  if(ref.version&&ref.version!==result.version.version)throw new TopicSharingError('日报数据版本已更新，请重新选择话题。',409);
  const topic=result.report.topics.find(row=>row.id===ref.topicId);if(!topic)throw new TopicSharingError('日报话题不存在。',404);
  const analysis=topic.aiAnalysis as TopicAnalysis|undefined;
  return finalize({ref:{...ref,version:result.version.version},topicId:topic.id,date:ref.date,observedAt:result.report.generatedAt,title:text(topic.title,400),summary:text(analysis?.summary??topic.oneLine,3000),
   detail:text([analysis?.detailedContent,relatedDevelopmentText(topic)].filter(Boolean).join('\n\n'),12000),context:text(analysis?.outsiderContext??topic.whyItMatters,5000),categories:topic.categories,rank:topic.rank,signal:topic.signal,
   links:links(dailyStoryLinks(topic),48),analysis,commentExamples:analysis?.commentExamples,cover:safeTopicLink(topic.cover)});
 }catch(error){if(error instanceof BrowseError)throw new TopicSharingError(error.message,error.status);throw error;}
}
