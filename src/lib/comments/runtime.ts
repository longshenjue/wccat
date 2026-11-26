import {getDb,readTopicAnalysesForDate,saveTopicAnalysisToDb,writeGeneration} from '../db';
import {buildFallbackTopicAnalysis,type TopicAnalysis} from '../topic-analysis';
import type {DailySnapshot} from '../types';
import {CommentCollector} from './collector';
import {CommentClassifier} from './classifier';
import {guardedWrite} from '../maintenance';
import type {CommentLog} from './types';
import {visibleCommentQuotes} from './selection';
export function commentTopicLimit(){const n=Number(process.env.WCCAT_COMMENT_TOPICS??10);return Number.isFinite(n)?Math.min(20,Math.max(0,Math.floor(n))):10;}
export async function enrichTopicComments(topic:{title:string;occurrences:Array<{sourceId:string;url:string}>},analysis:TopicAnalysis,log?:CommentLog):Promise<TopicAnalysis>{
 if(process.env.WCCAT_COMMENTS_ENABLED==='false'||process.env.WCCAT_COMMENTS_ENABLED==='0'||commentTopicLimit()===0||!process.env.DEEPSEEK_API_KEY){log?.('info',!process.env.DEEPSEEK_API_KEY?'未配置分类服务，未采集评论。':'评论采集已关闭，未请求。');return analysis;}
 const db=getDb(),limit=Number(process.env.WCCAT_COMMENT_DAILY_LIMIT??100);
 const sample=await new CommentCollector(db,{dailyLimit:Number.isFinite(limit)?limit:100,log}).collect(topic.occurrences);
 const selected=await new CommentClassifier(db,{log}).classify(sample,analysis.battle,topic.title);
 const commentExamples=selected??analysis.commentExamples;
 log?.('info',`本轮取得 ${sample.comments.length} 条；可展示中文 ${visibleCommentQuotes(commentExamples,analysis.battle,'zh').length} 条、英文 ${visibleCommentQuotes(commentExamples,analysis.battle,'en').length} 条${!selected&&analysis.commentExamples?'（沿用已保存评论，未冒称新采集）':''}。`);
 return {...analysis,commentExamples};
}
/** Extra examples do not require running full topic analysis for every ranked item. */
export async function precomputeCommentExamples(snapshot:DailySnapshot){
 if(!process.env.DEEPSEEK_API_KEY||process.env.WCCAT_COMMENTS_ENABLED==='false'||process.env.WCCAT_COMMENTS_ENABLED==='0')return;
 const generation=writeGeneration(),existing=readTopicAnalysesForDate(snapshot.date);
 for(const topic of snapshot.topics.slice(0,commentTopicLimit())){
  const log:CommentLog=(level,message)=>console[level](`[WcCAT][comments] #${topic.rank} ${message}`);
  const analysis=existing[topic.id]??buildFallbackTopicAnalysis(topic),enriched=await enrichTopicComments(topic,analysis,log);
  if(enriched.commentExamples||analysis.commentExamples)guardedWrite(getDb(),()=>{
   // Comments must not overwrite a newer analysis produced while collection/translation was running.
   const current=readTopicAnalysesForDate(snapshot.date)[topic.id];
   if(JSON.stringify(current)!==JSON.stringify(existing[topic.id]))return;
   saveTopicAnalysisToDb(snapshot.date,topic.id,enriched,generation,snapshot.evidenceRunIds,{topic});
  },generation);
 }
}
