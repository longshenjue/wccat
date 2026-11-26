import type {DailyReportTopic,GenerationLog,WccatDailyReport} from '../daily-report';
import {commentTopicLimit,enrichTopicComments} from './runtime';
import {sameNewsFact} from '../news-facts';
import {visibleCommentQuotes} from './selection';

/** Prior daily-only quotes remain usable only in the same window, fact and exact attitudes. */
export function reuseDailyComments(current:Pick<WccatDailyReport,'reportDate'|'windowStart'|'windowEnd'|'topics'>,previous:WccatDailyReport|null):void {
 if(!previous||current.reportDate!==previous.reportDate||current.windowStart!==previous.windowStart||current.windowEnd!==previous.windowEnd)return;
 for(const topic of current.topics){
  const analysis=topic.aiAnalysis;if(!analysis||visibleCommentQuotes(analysis.commentExamples,analysis.battle,'zh').length)continue;
  const saved=previous.topics.find(old=>sameNewsFact(topic.title,old.title)&&visibleCommentQuotes(old.aiAnalysis?.commentExamples,analysis.battle,'zh').length)?.aiAnalysis?.commentExamples;
  if(saved)analysis.commentExamples=structuredClone(saved);
 }
}

/** A daily fact owns all of its merged links, not just the hour chosen for its prose. */
export async function enrichDailyComments(topics:DailyReportTopic[],log:GenerationLog,enrich=enrichTopicComments,limit=commentTopicLimit()):Promise<void>{
 for(const topic of topics.slice(0,Math.min(20,Math.max(0,Math.floor(limit))))){
  const write:GenerationLog=(level,message)=>log(level,`#${topic.rank} 评论：${message}`);
  if(!topic.aiAnalysis){write('info','缺少可用态度分析，未进行红蓝评论选择。');continue;}
  topic.aiAnalysis=await enrich({title:topic.title,occurrences:topic.links},topic.aiAnalysis,write);
 }
}
