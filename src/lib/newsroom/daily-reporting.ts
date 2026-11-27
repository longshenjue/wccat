import {createHash} from 'node:crypto';
import {researchTopicShare} from '../topic-sharing/research';
import {prepareTopicShareAssets} from '../topic-sharing/assets';
import {recommendTopic} from '../topic-sharing/recommendation';
import {analyzeTopicWithDeepSeek} from '../topic-analysis';
import {supportsDailyStoryHighlight} from '../daily-story-selection';
import {MaintenanceError} from '../maintenance';
import type {DailyReportTopic,GenerationLog} from '../daily-report';
import type {TopicShareSource} from '../topic-sharing/types';
import type {TopicGroup,SourceCategory} from '../types';

type Options={research?:typeof researchTopicShare;assets?:typeof prepareTopicShareAssets;analyze?:typeof analyzeTopicWithDeepSeek};
const highlightTarget=3;
const candidateLimit=10;

/** Explicit generation only: backfill three supported stories within the original Top10. */
export async function enrichDailyReporting(topics:DailyReportTopic[],date:string,log:GenerationLog,options:Options={}):Promise<void>{
 if((!process.env.DEEPSEEK_API_KEY||process.env.WCCAT_TOPIC_RESEARCH_ENABLED==='false')&&!options.research)return;
 const candidates=topics.slice(0,candidateLimit);
 const supportedCount=()=>candidates.filter(topic=>supportsDailyStoryHighlight(topic,true)).length;
 const sources=candidates.map(topic=>{
  const ref={kind:'daily' as const,date,topicId:topic.id},source:TopicShareSource={ref,sourceKey:createHash('sha256').update(JSON.stringify(ref)).digest('hex'),fingerprint:createHash('sha256').update(JSON.stringify(topic)).digest('hex'),date,observedAt:new Date().toISOString(),topicId:topic.id,title:topic.title,summary:topic.oneLine,detail:topic.aiAnalysis?.detailedContent??'',context:topic.aiAnalysis?.outsiderContext??'',rank:topic.rank,signal:topic.signal,categories:topic.categories,links:topic.links,analysis:topic.aiAnalysis,commentExamples:topic.aiAnalysis?.commentExamples,cover:topic.cover};
  source.coverAttribution=topic.coverAttribution;
  return {topic,source,priority:recommendTopic(source).english.score};
 }).sort((a,b)=>b.priority-a.priority||a.topic.rank-b.topic.rank);
 let attempts=0;
 for(const {topic,source} of sources){
  if(supportedCount()>=highlightTarget)break;
  if(supportsDailyStoryHighlight(topic,true))continue;
  attempts++;
  const emit:GenerationLog=(level,message)=>log(level,`#${topic.rank} 新闻补充：${message}`);
  emit('info',`候选检索 ${attempts}/${candidates.length}，已就绪 ${supportedCount()}/${highlightTarget}。`);
  let researched:TopicShareSource;
  try{researched=await (options.research??researchTopicShare)(source,{log:emit});}
  catch(error){if(error instanceof MaintenanceError)throw error;emit('warn','检索失败，保留已有内容并继续下一条候补。');continue;}
  topic.research=researched.research;
  const docs=researched.research?.documents.filter(doc=>doc.purpose==='event')??[];
  if(!docs.length){
   emit('warn','未取得当前事件报道，背景资料保留，继续下一条候补。');
   continue;
  }
  try{
   const categories=topic.categories.filter((category):category is SourceCategory=>['social','search','video','news','business','community'].includes(category));
   const group:TopicGroup={id:topic.id,title:topic.title,normalizedTitle:topic.title,rank:topic.rank,heatScore:topic.peakHeatScore,sources:topic.sources,sourceKinds:['public'],categories,occurrences:topic.links.map((link,index)=>({...link,sourceKind:'public',sourceCategory:categories[0]??'news',rank:index+1,fetchedAt:source.observedAt,normalizedTitle:link.title,platformScore:0})),signal:'steady',sentiment:topic.sentiment,officialPublicResonance:false,summary:{oneLine:topic.oneLine,whyItMatters:topic.whyItMatters,context:source.context,emotion:'neutral'}};
   const analysis=await (options.analyze??analyzeTopicWithDeepSeek)(group,docs.map(doc=>({sourceId:'research',sourceName:doc.publisher,title:doc.title,url:doc.url,text:doc.text})),topic.aiAnalysis);
   if(analysis.model!=='local-rules'){researched.analysis=analysis;researched.commentExamples=analysis.commentExamples;}
  }catch(error){if(error instanceof MaintenanceError)throw error;emit('warn','分析补充失败，保留当前报道与已有分析。');}
  let ready=researched;
  try{ready=await (options.assets??prepareTopicShareAssets)(researched,{log:emit});}
  catch(error){if(error instanceof MaintenanceError)throw error;emit('warn','可选配图或评论未完成，保留当前报道与分析。');}
  topic.research=ready.research;topic.photo=ready.photo;topic.readerComments=ready.readerComments;topic.assetWarnings=ready.assetWarnings;
  if(ready.analysis){topic.aiAnalysis=ready.analysis;topic.oneLine=ready.analysis.summary;topic.whyItMatters=ready.analysis.outsiderContext;}
  if(!supportsDailyStoryHighlight(topic,true))emit('warn','报道缺少可展开的说明，继续下一条候补。');
 }
 const supported=supportedCount();
 log(supported>=highlightTarget?'info':'warn',`日报详情补充完成：可展开 ${supported}/${highlightTarget} 条，新增检索 ${attempts} 条，候选上限 Top${candidateLimit}。${supported<highlightTarget?'候选已耗尽，未使用标题或历史背景凑数。':''}`);
}
