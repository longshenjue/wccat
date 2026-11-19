import {emitEvidenceBatch,evidencePersistenceFailed} from '../evidence-capture';
import type {TopicGroup,SupplementalEvidence} from '../types';
import type {TianApiClient,TianResult} from './client';
import {TIANAPI_CATALOG,TIANAPI_ENDPOINTS,tianTopicKey} from './catalog';

export async function fetchTianAuxiliary(client:TianApiClient|undefined) {
 if(!client)return [];
 const results:TianResult[]=[];
 for(const endpoint of TIANAPI_ENDPOINTS.filter(endpoint=>TIANAPI_CATALOG[endpoint].auxiliary)){
  try{const result=await client.fetch(endpoint);if(result){await emitEvidenceBatch(result.batch);results.push(result);}}
  catch(error){evidencePersistenceFailed(error);}
 }
 return results;
}
/** Exact full title comparison; never fuzzy-match a factual supplement. */
export function attachTianContext(topics:TopicGroup[],results:TianResult[]):TopicGroup[] {
 const contexts=new Map<string,SupplementalEvidence[]>();
 for(const result of results)for(const item of result.items){
  const key=tianTopicKey(item.title),list=contexts.get(key)??[];
  if(list.length<4)list.push({provider:'tianapi',platform:item.sourceId,endpoint:item.providerEndpoint!,title:item.title,description:item.description?.slice(0,800),url:item.url,
   rank:item.rank,heatText:item.heatText,observedAt:item.fetchedAt,runId:result.batch.id!});
  contexts.set(key,list);
 }
 return topics.map(topic=>{
  const matched=new Map<string,SupplementalEvidence>();
  for(const title of [topic.title,...topic.occurrences.map(item=>item.title)])for(const value of contexts.get(tianTopicKey(title))??[])matched.set(value.runId+'|'+value.url,value);
  const values=[...matched.values()].slice(0,4);return values.length?{...topic,supplementalEvidence:values}:topic;
 });
}
