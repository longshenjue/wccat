import type {LocalizedTopicShare,TopicRecommendation,TopicShareRecord,TopicShareSource} from './types';

/** Incomplete drafts display the first candidate; editing binds that displayed id. */
export function updateSelectedTopicSharePost(copy:LocalizedTopicShare,text:string):LocalizedTopicShare {
 const selected=copy.posts.find(post=>post.id===copy.selectedPostId)??copy.posts[0];
 if(!selected)return copy;
 return {...copy,selectedPostId:selected.id,posts:copy.posts.map(post=>post.id===selected.id?{...post,text}:post)};
}

export type TopicShareEditorData={source:TopicShareSource;recommendation:TopicRecommendation;record:TopicShareRecord|null};

/** Saved-draft reads and saves return frozen evidence, not a refreshed generation source. */
export function reconcileSavedTopicShareData(previous:TopicShareEditorData|undefined,incoming:TopicShareEditorData):TopicShareEditorData {
 if(!previous||!incoming.record||previous.source.sourceKey!==incoming.source.sourceKey||incoming.source.fingerprint!==incoming.record.source.fingerprint)return incoming;
 return {...incoming,source:previous.source,recommendation:previous.recommendation};
}

/** A live reload refreshes evidence; a missing or retired source version falls back to its saved draft. */
export async function reloadTopicShareData(previous:TopicShareEditorData|undefined,readers:{live:()=>Promise<TopicShareEditorData>;frozen?:()=>Promise<TopicShareEditorData>}):Promise<TopicShareEditorData> {
 try{return await readers.live();}
 catch(error){
  if(!readers.frozen||!error||typeof error!=='object'||!('status' in error)||![404,409].includes(error.status as number))throw error;
  return reconcileSavedTopicShareData(previous,await readers.frozen());
 }
}
