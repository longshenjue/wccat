import {createHash} from 'node:crypto';
import {researchTopicShare} from '../topic-sharing/research';
import {prepareTopicShareAssets} from '../topic-sharing/assets';
import {recommendTopic} from '../topic-sharing/recommendation';
import {analyzeTopicWithDeepSeek} from '../topic-analysis';
import type {DailyReportTopic,GenerationLog} from '../daily-report';
import type {TopicShareSource} from '../topic-sharing/types';
import type {TopicGroup,SourceCategory} from '../types';

type Options={research?:typeof researchTopicShare;assets?:typeof prepareTopicShareAssets;analyze?:typeof analyzeTopicWithDeepSeek};
/** Explicit daily generation only: three stories, preserving all ten ranking slots. */
export async function enrichDailyReporting(topics:DailyReportTopic[],date:string,log:GenerationLog,options:Options={}):Promise<void>{
 if((!process.env.DEEPSEEK_API_KEY||process.env.WCCAT_TOPIC_RESEARCH_ENABLED==='false')&&!options.research)return;
 const sources=topics.map(topic=>{
  const ref={kind:'daily' as const,date,topicId:topic.id},source:TopicShareSource={ref,sourceKey:createHash('sha256').update(JSON.stringify(ref)).digest('hex'),fingerprint:createHash('sha256').update(JSON.stringify(topic)).digest('hex'),date,observedAt:new Date().toISOString(),topicId:topic.id,title:topic.title,summary:topic.oneLine,detail:topic.aiAnalysis?.detailedContent??'',context:topic.aiAnalysis?.outsiderContext??'',rank:topic.rank,signal:topic.signal,categories:topic.categories,links:topic.links,analysis:topic.aiAnalysis,commentExamples:topic.aiAnalysis?.commentExamples,cover:topic.cover};
  source.coverAttribution=topic.coverAttribution;
  return {topic,source,priority:recommendTopic(source).english.score};
 }).sort((a,b)=>b.priority-a.priority||a.topic.rank-b.topic.rank).slice(0,3);
 for(const {topic,source} of sources){
  const emit:GenerationLog=(level,message)=>log(level,`#${topic.rank} 新闻补充：${message}`);
  const researched=await (options.research??researchTopicShare)(source,{log:emit});
  const docs=researched.research?.documents.filter(doc=>doc.purpose==='event')??[];
  if(docs.length){
   const categories=topic.categories.filter((category):category is SourceCategory=>['social','search','video','news','business','community'].includes(category));
   const group:TopicGroup={id:topic.id,title:topic.title,normalizedTitle:topic.title,rank:topic.rank,heatScore:topic.peakHeatScore,sources:topic.sources,sourceKinds:['public'],categories,occurrences:topic.links.map((link,index)=>({...link,sourceKind:'public',sourceCategory:categories[0]??'news',rank:index+1,fetchedAt:source.observedAt,normalizedTitle:link.title,platformScore:0})),signal:'steady',sentiment:topic.sentiment,officialPublicResonance:false,summary:{oneLine:topic.oneLine,whyItMatters:topic.whyItMatters,context:source.context,emotion:'neutral'}};
   const analysis=await (options.analyze??analyzeTopicWithDeepSeek)(group,docs.map(doc=>({sourceId:'research',sourceName:doc.publisher,title:doc.title,url:doc.url,text:doc.text})),topic.aiAnalysis);
   if(analysis.model!=='local-rules'){researched.analysis=analysis;researched.commentExamples=analysis.commentExamples;}
  }
  const ready=await (options.assets??prepareTopicShareAssets)(researched,{log:emit});
  topic.research=ready.research;topic.photo=ready.photo;topic.readerComments=ready.readerComments;topic.assetWarnings=ready.assetWarnings;
  if(ready.analysis){topic.aiAnalysis=ready.analysis;if(docs.length){topic.oneLine=ready.analysis.summary;topic.whyItMatters=ready.analysis.outsiderContext;}}
 }
}
