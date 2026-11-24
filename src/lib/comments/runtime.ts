import {getDb,readTopicAnalysesForDate,saveTopicAnalysisToDb,writeGeneration} from '../db';
import {buildFallbackTopicAnalysis,type TopicAnalysis} from '../topic-analysis';
import type {DailySnapshot,TopicGroup} from '../types';
import {CommentCollector} from './collector';
import {CommentClassifier} from './classifier';
import {guardedWrite} from '../maintenance';
export function commentTopicLimit(){const n=Number(process.env.WCCAT_COMMENT_TOPICS??10);return Number.isFinite(n)?Math.min(20,Math.max(0,Math.floor(n))):10;}
export async function enrichTopicComments(topic:TopicGroup,analysis:TopicAnalysis):Promise<TopicAnalysis>{
 if(process.env.WCCAT_COMMENTS_ENABLED==='false'||process.env.WCCAT_COMMENTS_ENABLED==='0'||commentTopicLimit()===0||!process.env.DEEPSEEK_API_KEY)return analysis;
 const db=getDb(),limit=Number(process.env.WCCAT_COMMENT_DAILY_LIMIT??100);
 const sample=await new CommentCollector(db,{dailyLimit:Number.isFinite(limit)?limit:100}).collect(topic.occurrences);
 const commentExamples=await new CommentClassifier(db).classify(sample,analysis.battle,topic.title);
 return {...analysis,commentExamples};
}
/** Extra examples do not require running full topic analysis for every ranked item. */
export async function precomputeCommentExamples(snapshot:DailySnapshot){
 if(!process.env.DEEPSEEK_API_KEY||process.env.WCCAT_COMMENTS_ENABLED==='false'||process.env.WCCAT_COMMENTS_ENABLED==='0')return;
 const generation=writeGeneration(),existing=readTopicAnalysesForDate(snapshot.date);
 for(const topic of snapshot.topics.slice(0,commentTopicLimit())){
  const analysis=existing[topic.id]??buildFallbackTopicAnalysis(topic),enriched=await enrichTopicComments(topic,analysis);
  if(enriched.commentExamples||analysis.commentExamples)guardedWrite(getDb(),()=>{
   // Comments must not overwrite a newer analysis produced while collection/translation was running.
   const current=readTopicAnalysesForDate(snapshot.date)[topic.id];
   if(JSON.stringify(current)!==JSON.stringify(existing[topic.id]))return;
   saveTopicAnalysisToDb(snapshot.date,topic.id,enriched,generation,snapshot.evidenceRunIds,{topic});
  },generation);
 }
}
