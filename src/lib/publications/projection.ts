import type {WccatDailyReport} from '../daily-report';
import type {TopicShareRecord} from '../topic-sharing/types';
import {buildChineseDailyCards} from '../daily-bilingual-cards';
import {visibleCommentQuotes} from '../comments/selection';
import {publicationLink,publicationHref} from './links';
import {shareEnImage} from '../shareen-media';
import {topicEvidenceTexts} from '../topic-sharing/evidence';
import type {CommentExamples} from '../comments/types';
import type {PublicationComment,PublicationPayload} from './types';

function comments(examples:CommentExamples|undefined,battle:{redLabel:string;blueLabel:string}|undefined):PublicationComment[]{
 const translated=new Map(visibleCommentQuotes(examples,battle,'en',{allowMixedEnglish:true}).map(row=>[row.quote.id,row.text]));
 return visibleCommentQuotes(examples,battle,'zh').map(({side,quote,text})=>({side,sourceId:quote.sourceId,sourceName:quote.sourceName,url:quote.url,text,...(translated.has(quote.id)?{englishText:translated.get(quote.id),englishIsExcerpt:quote.englishIsExcerpt}:{}),...(quote.likes!==undefined?{likes:quote.likes}:{})}));
}
const chosen=(local:TopicShareRecord['copy']['en'])=>(local.posts.find(post=>post.id===local.selectedPostId)??local.posts[0])?.text??'';

/** Whitelist published reader material; no admin notes, alternatives or model metadata. */
export function topicPublication(record:TopicShareRecord):PublicationPayload {
 const {source,copy}=record;
 return {version:1,kind:source.ref.kind==='hourly'?'hourly':'topic',date:source.date,titles:{en:copy.en.headline||source.title,zh:copy.zh.headline||source.title},posts:{en:chosen(copy.en),zh:chosen(copy.zh)},cards:[{id:'story',rank:source.rank,selected:true,
  en:{title:copy.en.headline,summary:copy.en.summary,context:copy.en.context,why:copy.en.whyItMatters},zh:{title:copy.zh.headline,summary:copy.zh.summary,context:copy.zh.context,why:copy.zh.whyItMatters},
  links:source.links.flatMap(link=>{const safe=publicationLink(link);return safe?[safe]:[];}),comments:comments(source.commentExamples??source.analysis?.commentExamples,source.analysis?.battle)}]};
}

export function dailyPublication(report:WccatDailyReport):PublicationPayload {
 const english=report.shareEn;if(!english)throw new Error('请先生成并保存日报分享文案。');
 let chinese:ReturnType<typeof buildChineseDailyCards>|undefined;
 try{chinese=buildChineseDailyCards(report,english);}catch(error){if(!(error instanceof Error)||!error.message.includes('缺少已保存的中文说明'))throw error;}
 return {version:1,kind:'daily',date:report.reportDate,titles:{en:`WcCAT Daily · ${report.reportDate}`,zh:`WcCAT 每日热点 · ${report.reportDate}`},posts:{en:english.posts.find(post=>post.id===english.selectedPostId)?.text??'',zh:chinese?.posts[0]?.text??''},cards:report.topics.slice(0,10).map((topic,index)=>{
  const en=english.highlights.find(highlight=>highlight.topicId===topic.id),zh=chinese?.highlights.find(highlight=>highlight.topicId===topic.id);
  const evidence=topicEvidenceTexts({title:topic.title,summary:topic.oneLine,context:topic.whyItMatters,analysis:topic.aiAnalysis});
  const focusIndex=english.highlights.findIndex(highlight=>highlight.topicId===topic.id),image=focusIndex<0?undefined:shareEnImage(report,english,focusIndex+1),imageUrl=image?publicationHref(image.url):undefined;
  return {id:`story-${index+1}`,rank:topic.rank,selected:!!en,en:{title:english.overview.topics.find(row=>row.id===topic.id)?.title??'',summary:en?.whatHappened??'',context:en?.context??'',why:en?.whyItMatters??''},zh:{title:topic.title,summary:zh?.whatHappened??evidence[0]??'',context:zh?.context??'',why:zh?.whyItMatters??''},
   links:topic.links.flatMap(link=>{const safe=publicationLink(link);return safe?[safe]:[];}),comments:comments(topic.aiAnalysis?.commentExamples,topic.aiAnalysis?.battle),...(imageUrl?{imageUrl}:{})};
 })};
}
