import {topicReaderComments} from './readers';
import {visibleCommentQuotes} from '../comments/selection';
import type {TopicShareRecord} from './types';

/** Required media are independent of advisory translation and grammar review. */
export function topicShareReadiness(record:Pick<TopicShareRecord,'source'|'copy'>){
 const missing:string[]=[];
 if(record.copy.editorialPolicy==='news-commentary-v2'){
  const source=record.source;
  if(!source.photo?.dataBase64)missing.push('image');
  if(!topicReaderComments(source).length&&!visibleCommentQuotes(source.commentExamples??source.analysis?.commentExamples,source.analysis?.battle,'zh').length)missing.push('comments');
  if(!source.research?.documents.some(doc=>doc.purpose==='event'))missing.push('news');
 }
 return {ready:missing.length===0,missing,message:missing.length?'素材尚未补齐：'+missing.map(item=>({image:'新闻图片',comments:'真实网友评论',news:'当前事件报道'})[item]).join('、')+'。文案草稿已保留，请补齐后再发布或下载。':''};
}
