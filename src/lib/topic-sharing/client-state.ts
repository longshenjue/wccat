import type {TopicRecommendation,TopicShareRecord,TopicShareSource} from './types';

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
