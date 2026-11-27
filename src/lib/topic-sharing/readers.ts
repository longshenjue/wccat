import {commentArticleUrl} from '../comments/adapters';
import type {TopicReaderComment,TopicShareSource} from './types';

export function topicReaderComments(source:Pick<TopicShareSource,'readerComments'>):TopicReaderComment[]{
 const seen=new Set<string>();
 return (source.readerComments??[]).filter(quote=>{
  if(!quote.id||seen.has(quote.id)||!quote.text?.trim()||!Number.isFinite(Date.parse(quote.observedAt)))return false;
  const canonical=commentArticleUrl({sourceId:quote.sourceId,url:quote.articleUrl});if(!canonical)return false;
  try{const target=new URL(quote.url),article=new URL(canonical);if(target.protocol!=='https:'||target.username||target.password||target.origin!==article.origin||target.pathname!==article.pathname||target.search)return false;}catch{return false;}
  seen.add(quote.id);return true;
 }).slice(0,2);
}
