import type {DailyReportTopic} from './daily-report';
import {topicEvidenceTexts} from './topic-sharing/evidence';

/** Editorial storylines group related developments, never assert fact equivalence. */
export type DailyStorySelection={policy:'story-diversity-v1';mode:'semantic'|'fallback';candidateCount:number;reviewedCount:number;groupedDevelopments:number};

export function parseDailyStoryGroups(value:unknown,candidates:readonly Pick<DailyReportTopic,'id'>[]):string[][] {
 const data=value as {groups?:unknown};
 if(!data||!Array.isArray(data.groups)||data.groups.length>20)throw new Error('Invalid editorial groups');
 const known=new Set(candidates.map(topic=>topic.id)),seen=new Set<string>();
 return data.groups.map(group=>{
  if(!Array.isArray(group)||group.length<2||group.length>8)throw new Error('Invalid editorial group size');
  return group.map(id=>{
   if(typeof id!=='string'||!known.has(id)||seen.has(id))throw new Error('Invalid editorial group identity');
   seen.add(id);return id;
  });
 });
}

/** Apply only validated groups; unlisted facts stay independent and retain their score. */
export function selectDailyStories(candidates:readonly DailyReportTopic[],groups:readonly string[][],limit=10):DailyReportTopic[] {
 const checked=parseDailyStoryGroups({groups},candidates),membership=new Map<string,number>();
 checked.forEach((group,index)=>group.forEach(id=>membership.set(id,index)));
 const sorted=[...candidates].sort((a,b)=>b.dailyScore-a.dailyScore),byId=new Map(sorted.map(topic=>[topic.id,topic]));
 const selected:DailyReportTopic[]=[],seen=new Set<number>();
 for(const topic of sorted){
  const group=membership.get(topic.id);
  if(group!==undefined&&seen.has(group))continue;
  if(group!==undefined)seen.add(group);
  const related=group===undefined?[]:checked[group].filter(id=>id!==topic.id).map(id=>byId.get(id)!).sort((a,b)=>b.dailyScore-a.dailyScore);
  selected.push({...topic,rank:selected.length+1,...(related.length?{relatedDevelopments:related}:{})});
  if(selected.length>=limit)break;
 }
 return selected;
}

/** Preserve stage boundaries and original wording when preparing a single story. */
export function relatedDevelopmentText(topic:DailyReportTopic):string {
 return (topic.relatedDevelopments??[]).map(stage=>{
  const evidence=topicEvidenceTexts({title:stage.title,summary:stage.oneLine,context:stage.whyItMatters,analysis:stage.aiAnalysis});
  const detail=[stage.aiAnalysis?.detailedContent,stage.aiAnalysis?.summary,...evidence].find(text=>text&&evidence.includes(text));
  return [stage.title,detail].filter(Boolean).join('：');
 }).join('\n');
}

/** A related headline or ranking template alone is not an explanatory source. */
export function dailyStoryEvidence(topic:DailyReportTopic){
 return [topic,...topic.relatedDevelopments??[]].map(stage=>({topic:stage,texts:topicEvidenceTexts({title:stage.title,summary:stage.oneLine,context:stage.whyItMatters,analysis:stage.aiAnalysis})})).filter(stage=>stage.texts.length>0);
}

/** Research backfill and final card selection must count the same supported stories. */
export function supportsDailyStoryHighlight(topic:DailyReportTopic,currentReporting=false):boolean {
 return dailyStoryEvidence(topic).length>0&&(!currentReporting||!!topic.research?.documents.some(doc=>doc.purpose==='event'));
}

export function dailyStoryLinks(topic:DailyReportTopic):DailyReportTopic['links'] {
 return [...new Map([topic,...topic.relatedDevelopments??[]].flatMap(stage=>stage.links).map(link=>[link.url,link])).values()];
}
