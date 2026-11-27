import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {normaliseShareEnBattle,resolveShareEnBattle,hasSourceShareEnBattle} from './shareen-battle';
import {readShareEnCaptionLine} from './shareen-caption';
import {recommendTopic,eligibleColumns} from './topic-sharing/recommendation';
import {columnForLanguage} from './topic-sharing/columns';
import type {TopicShareSource} from './topic-sharing/types';
import {shareEnOverviewAltText} from './shareen-overview';
import {relatedDevelopmentText,dailyStoryLinks,dailyStoryEvidence} from './daily-story-selection';

type Fields=Record<string,unknown>;
export type ShareEnDraftState={layout?:'editorial';reportingPolicy?:'current-news-v1';topics:Record<string,Fields>;highlightIds:unknown;posts:unknown;selectedPostId:unknown;top3:unknown};
export type ShareEnRepair={topicId?:string;field:'title'|'hook'|'whatHappened'|'whyItMatters'|'battle'|'highlightIds';required:boolean;reason:string};
const fields=['title','hook','whatHappened','whyItMatters','battle'] as const;
const object=(v:unknown):Fields=>v&&typeof v==='object'&&!Array.isArray(v)?v as Fields:{};
export const isEnglish=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&!/\p{Script=Han}/u.test(v)&&/[a-z]/i.test(v);
const clean=(v:unknown)=>isEnglish(v)?v.trim():'';
const words=(v:unknown)=>typeof v==='string'?v.trim().split(/\s+/).length:0;
const originalTopics=(report:WccatDailyReport)=>report.topics.slice(0,10);

/** Read-only projection into the shared browser-safe editorial evidence rules. */
export function shareEnEditorialSource(report:WccatDailyReport,topicId:string):TopicShareSource {
 const topic=originalTopics(report).find(t=>t.id===topicId);
 if(!topic)throw new Error('Unknown editorial topic identity');
 return {ref:{kind:'daily',date:report.reportDate,topicId},sourceKey:topicId,fingerprint:'',date:report.reportDate,observedAt:report.generatedAt,topicId,title:topic.title,summary:topic.oneLine,detail:[topic.aiAnalysis?.detailedContent,relatedDevelopmentText(topic)].filter(Boolean).join('\n\n'),context:topic.aiAnalysis?.outsiderContext??topic.whyItMatters,categories:topic.categories,rank:topic.rank,signal:topic.signal,links:dailyStoryLinks(topic),analysis:topic.aiAnalysis,readerComments:topic.readerComments,research:topic.research};
}
/** A ranking headline alone cannot support an explanatory story card. */
export function shareEnSupportedTopicIds(report:WccatDailyReport,currentReporting=false):string[] {
 return originalTopics(report).filter(topic=>dailyStoryEvidence(topic).length>0&&(!currentReporting||topic.research?.documents.some(doc=>doc.purpose==='event'))).map(topic=>topic.id);
}
export function validShareEnHighlightIds(ids:unknown,report:WccatDailyReport,editorial=false,policy?:ShareEnCopy['reportingPolicy']):ids is string[] {
 const allowed=editorial?shareEnSupportedTopicIds(report,policy==='current-news-v1'):originalTopics(report).map(t=>t.id);
 const target=editorial?Math.min(3,allowed.length):2;
 return Array.isArray(ids)&&target>0&&ids.length>=target&&ids.length<=(editorial?target:3)&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&allowed.includes(id));
}

/** Model IDs are keys, never positions. Metadata and final ranking are owned by the server. */
export function readShareEnDraft(value:unknown,report:WccatDailyReport,options:{layout?:'editorial';reportingPolicy?:'current-news-v1'}={}):ShareEnDraftState {
 const data=object(value),expected=new Set(originalTopics(report).map(t=>t.id));
 const topics:Record<string,Fields>=Object.fromEntries([...expected].map(id=>[id,{}]));
 const keyed=data.topics;
 if(keyed&&typeof keyed==='object'&&!Array.isArray(keyed)){
  for(const [id,item] of Object.entries(keyed)){
   if(!expected.has(id))continue; // Extra identities never enter the source-owned slots.
   topics[id]={...object(item)};
  }
 }else{
  const overview=object(data.overview),seen=new Set<string>(),duplicates=new Set<string>();
  if(Array.isArray(overview.topics))for(const item of overview.topics){
   const topic=object(item),id=topic.id;
   if(typeof id!=='string'||!expected.has(id))continue;
   if(seen.has(id)){duplicates.add(id);delete topics[id].title;continue;}seen.add(id);
   if(!duplicates.has(id))topics[id].title=topic.title;
  }
 }
 const highlights=Array.isArray(data.highlights)?data.highlights.map(object):[];
 const ids=highlights.map(h=>h.topicId);
 for(const h of highlights){
  const id=h.topicId;
  if(typeof id!=='string'||!expected.has(id))continue;
  const repeated=ids.filter(candidate=>candidate===id).length>1;
  for(const field of fields)if(field!=='title'){
   if(repeated)delete topics[id][field];
   else if(h[field]!==undefined)topics[id][field]=h[field];
  }
 }
 // Only use cached English when its identity matches, never fill by array index.
 for(const topic of originalTopics(report)){
  if(!isEnglish(topics[topic.id].title)){
   const cached=report.shareEnglish?.topics.filter(t=>t.id===topic.id);
   if(cached?.length===1&&isEnglish(cached[0].title))topics[topic.id].title=cached[0].title;
  }
 }
 return {...(options.layout==='editorial'||data.layout==='editorial'?{layout:'editorial' as const}:{}),...(options.reportingPolicy?{reportingPolicy:options.reportingPolicy}:{}),topics,highlightIds:data.highlightIds??ids,posts:data.posts,selectedPostId:data.selectedPostId,top3:data.top3};
}

export function shareEnRepairs(state:ShareEnDraftState,report:WccatDailyReport):ShareEnRepair[]{
 const repairs:ShareEnRepair[]=[],expected=originalTopics(report);
 for(const topic of expected)if(!isEnglish(state.topics[topic.id]?.title))repairs.push({topicId:topic.id,field:'title',required:true,reason:'Missing or non-English title'});
 const ids=state.highlightIds;
 if(!validShareEnHighlightIds(ids,report,state.layout==='editorial',state.reportingPolicy)){
  repairs.push({field:'highlightIds',required:true,reason:state.layout==='editorial'?`Choose exactly ${Math.min(3,shareEnSupportedTopicIds(report,state.reportingPolicy==='current-news-v1').length)} supported original topic IDs, with hook, whatHappened and whyItMatters for each choice; never pad headline-only material`:'Choose 2–3 distinct original topic IDs, with hook, whatHappened and whyItMatters for each choice'});
 }else for(const id of ids as string[]){
  for(const [field,budget] of [['hook',14],['whatHappened',40],['whyItMatters',30]] as const){
   const value=state.topics[id]?.[field];
   if(!isEnglish(value))repairs.push({topicId:id,field,required:true,reason:'Missing or non-English content'});
   else if(words(value)>budget)repairs.push({topicId:id,field,required:false,reason:`Shorten to at most ${budget} words for the image card; preserve the meaning`});
  }
  const battle=state.topics[id]?.battle;
  if(!resolveShareEnBattle(report,id,battle)&&(battle!==null||hasSourceShareEnBattle(report,id)))repairs.push({topicId:id,field:'battle',required:false,reason:hasSourceShareEnBattle(report,id)?'Translate the supplied source battle into compact English labels and explanations, preserving both sides and their source scores':'Provide compact English attitudes and a cautious relative energy estimate supported by source cues, or explicitly return null if there is insufficient evidence; never invent a split'});
 }
 return repairs;
}

/** Accept only requested patches. A repair cannot replace good copy, posts or editorial choices. */
export function applyShareEnRepair(state:ShareEnDraftState,value:unknown,repairs:ShareEnRepair[],report:WccatDailyReport):ShareEnDraftState {
 const patch=object(value),topics=object(patch.topics);
 const next={...state,topics:Object.fromEntries(Object.entries(state.topics).map(([id,item])=>[id,{...item}]))};
 for(const repair of repairs)if(repair.topicId){
  const value=object(topics[repair.topicId])[repair.field];
  if(repair.field==='battle'){
   const battle=normaliseShareEnBattle(value,report,repair.topicId);
   if(battle)next.topics[repair.topicId].battle=battle;
   else if(value===null&&!hasSourceShareEnBattle(report,repair.topicId))next.topics[repair.topicId].battle=null;
  }
  else if(isEnglish(value))next.topics[repair.topicId][repair.field]=value;
 }
 if(repairs.some(r=>r.field==='highlightIds')){
  const ids=patch.highlightIds;
  if(validShareEnHighlightIds(ids,report,state.layout==='editorial',state.reportingPolicy)){
   next.highlightIds=ids;
   for(const id of ids as string[])for(const field of fields){
    const value=object(topics[id])[field];
    if(field==='battle'){
     if(!resolveShareEnBattle(report,id,next.topics[id].battle)){
      const battle=normaliseShareEnBattle(value,report,id);
      if(battle)next.topics[id].battle=battle;
      else if(value===null&&!hasSourceShareEnBattle(report,id))next.topics[id].battle=null;
     }
    }
    else if(!isEnglish(next.topics[id][field])&&isEnglish(value))next.topics[id][field]=value;
   }
  }
 }
 return next;
}

export function completeShareEnDraft(state:ShareEnDraftState,report:WccatDailyReport):Omit<ShareEnCopy,'version'|'generatedAt'|'model'|'sourceFingerprint'> {
 const missing=shareEnRepairs(state,report).filter(r=>r.required);
 if(missing.length)throw new Error(`Incomplete ShareEn fields: ${missing.map(r=>`${r.topicId??'selection'}.${r.field}`).join(', ')}`);
 const topics=originalTopics(report).map(t=>({id:t.id,title:clean(state.topics[t.id].title)}));
 const editorial=state.layout==='editorial';
 const highlights=(state.highlightIds as string[]).map(topicId=>{
  const battle=resolveShareEnBattle(report,topicId,state.topics[topicId].battle);
  const source=editorial?shareEnEditorialSource(report,topicId):undefined;
  let column=source?recommendTopic(source,{commentLanguage:'en'}).column:undefined;
  // The existing comment renderer needs a translated attitude analysis. Do not
  // label the card as voices if its saved quotes cannot actually be displayed.
  if(column==='voices'&&!battle)column=eligibleColumns(source!,{commentLanguage:'en'}).includes('tech')?'tech':'inside';
  return {...(battle?{battle}:{}),...(column?{column}:{}),topicId,hook:clean(state.topics[topicId].hook),whatHappened:clean(state.topics[topicId].whatHappened),context:'',whyItMatters:clean(state.topics[topicId].whyItMatters)};
 });
 const legacyTop3=Array.isArray(state.top3)?state.top3.map(object):[];
 const top3=highlights.map(h=>{
  const legacy=legacyTop3.filter(item=>item.topicId===h.topicId);
  const summary=legacy.length===1&&isEnglish(legacy[0].summary)?legacy[0].summary:topics.find(item=>item.id===h.topicId)!.title;
  return {topicId:h.topicId,summary:summary.replace(/\s+/gu,' ').trim()};
 });
 const legacyPatterns:Record<string,string>={daily_digest:'specific_observation',story_led:'specific_observation',number_led:'contextual_number',global_bridge:'culture_translation',topic_contrast:'counterpoint'};
 const rawPosts=Array.isArray(state.posts)?state.posts.map(object).filter(p=>isEnglish(p.text)&&!p.text.split(/\r?\n/u).some(readShareEnCaptionLine)).slice(0,3).map(p=>editorial&&typeof p.template==='string'&&legacyPatterns[p.template]?{...p,template:legacyPatterns[p.template]}:p):[];
 const defaults=editorial?[{id:'observation',template:'specific_observation',text:highlights[0].hook,reason:'One concrete detail from the selected stories.'},{id:'context',template:'culture_translation',text:highlights[0].whyItMatters,reason:'Start with the context an unfamiliar reader needs.'}]:[{id:'digest',template:'daily_digest',text:'Today on the Chinese internet.',reason:'The stories featured in the focus cards.'},{id:'bridge',template:'global_bridge',text:'China’s daily trends, in context.',reason:'A brief introduction for readers abroad.'}];
 const patterns=new Set<string>();
 const candidates=editorial?rawPosts.filter(post=>{
  if(!['specific_observation','source_quote','contextual_number','counterpoint','culture_translation','update'].includes(String(post.template))||patterns.has(String(post.template)))return false;
  patterns.add(String(post.template));return true;
 }):[...rawPosts];
 while(candidates.length<2){
  const fallback=editorial?defaults.find(post=>!candidates.some(item=>item.template===post.template))!:defaults[candidates.length===0?0:1];
  candidates.push(fallback);
 }
 const seen=new Set<string>();
 const posts=candidates.map((p,index)=>{
  const proposed=typeof p.id==='string'&&p.id.trim()?p.id.trim():`post-${index+1}`;
  let id=proposed;while(seen.has(id))id=`${id}-${index+1}`;seen.add(id);
  const hook=editorial?clean(p.text).replace(/^WcCAT Daily Hot:?(?: 🇨🇳)?\s*\n+/u,'').trim():clean(p.text);
  const entries=top3.map((t,i)=>`${['1️⃣','2️⃣','3️⃣'][i]} ${t.summary}`).join('\n');
  return {id,template:typeof p.template==='string'&&p.template.trim()?p.template.trim():'daily_digest',reason:typeof p.reason==='string'&&p.reason.trim()?p.reason.trim():'The selected focus stories.',text:editorial?`${hook}\n\n${entries}\n\nWcCAT: China, in context. Read the cards; sources & context in the reply.`:`WcCAT Daily Hot\n\n${hook}\n\n${entries}\n\nWcCAT: read the cards. CHINA, IN CONTEXT.`};
 });
 const opener=editorial?shareEnOverviewAltText(report,topics):`WcCAT Daily Hot, ${report.reportDate}. China’s Top ${topics.length}: ${topics.map(t=>t.title).join('; ')}.`;
 return {...(editorial?{layout:'editorial' as const}:{}),...(state.reportingPolicy?{reportingPolicy:state.reportingPolicy}:{}),captionBasis:'highlights',overview:{headline:editorial?'China, beyond the headlines':`China’s Top ${topics.length}`,summary:editorial?'Selected signals, with the context to understand them.':'',topics},highlights,top3,posts,selectedPostId:typeof state.selectedPostId==='string'&&seen.has(state.selectedPostId)?state.selectedPostId:posts[0].id,altTexts:[opener,...highlights.map(h=>`${h.column?columnForLanguage(h.column,'en')+'. ':''}${h.hook}. ${h.whatHappened} ${h.whyItMatters}${h.battle?` Debate energy (${h.battle.basis==='analysis'?'existing analysis':'AI estimate'}): ${h.battle.redLabel} ${h.battle.redScore}, ${h.battle.blueLabel} ${h.battle.blueScore}. ${h.battle.redRationale} ${h.battle.blueRationale}`:''}`)]};
}
