import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {normaliseShareEnBattle,resolveShareEnBattle} from './shareen-battle';

type Fields=Record<string,unknown>;
export type ShareEnDraftState={topics:Record<string,Fields>;highlightIds:unknown;posts:unknown;selectedPostId:unknown;top3:unknown};
export type ShareEnRepair={topicId?:string;field:'title'|'hook'|'whatHappened'|'whyItMatters'|'battle'|'highlightIds';required:boolean;reason:string};
const fields=['title','hook','whatHappened','whyItMatters','battle'] as const;
const object=(v:unknown):Fields=>v&&typeof v==='object'&&!Array.isArray(v)?v as Fields:{};
export const isEnglish=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&!/\p{Script=Han}/u.test(v)&&/[a-z]/i.test(v);
const clean=(v:unknown)=>isEnglish(v)?v.trim():'';
const words=(v:unknown)=>typeof v==='string'?v.trim().split(/\s+/).length:0;
const originalTopics=(report:WccatDailyReport)=>report.topics.slice(0,10);

/** Model IDs are keys, never positions. Metadata and final ranking are owned by the server. */
export function readShareEnDraft(value:unknown,report:WccatDailyReport):ShareEnDraftState {
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
 return {topics,highlightIds:data.highlightIds??ids,posts:data.posts,selectedPostId:data.selectedPostId,top3:data.top3};
}

export function shareEnRepairs(state:ShareEnDraftState,report:WccatDailyReport):ShareEnRepair[]{
 const repairs:ShareEnRepair[]=[],expected=originalTopics(report);
 for(const topic of expected)if(!isEnglish(state.topics[topic.id]?.title))repairs.push({topicId:topic.id,field:'title',required:true,reason:'Missing or non-English title'});
 const ids=state.highlightIds;
 if(!Array.isArray(ids)||ids.length<2||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!expected.some(t=>t.id===id))){
  repairs.push({field:'highlightIds',required:true,reason:'Choose 2–3 distinct original topic IDs, with hook, whatHappened and whyItMatters for each choice'});
 }else for(const id of ids as string[]){
  for(const [field,budget] of [['hook',14],['whatHappened',40],['whyItMatters',30]] as const){
   const value=state.topics[id]?.[field];
   if(!isEnglish(value))repairs.push({topicId:id,field,required:true,reason:'Missing or non-English content'});
   else if(words(value)>budget)repairs.push({topicId:id,field,required:false,reason:`Shorten to at most ${budget} words for the image card; preserve the meaning`});
  }
  if(state.topics[id]?.battle!==undefined&&!resolveShareEnBattle(report,id,state.topics[id].battle))repairs.push({topicId:id,field:'battle',required:false,reason:'Provide two compact English attitude labels and short explanations; use the existing scores if available, otherwise an editorial estimate'});
 }
 return repairs;
}

/** Accept only requested patches. A repair cannot replace good copy, posts or editorial choices. */
export function applyShareEnRepair(state:ShareEnDraftState,value:unknown,repairs:ShareEnRepair[],report:WccatDailyReport):ShareEnDraftState {
 const patch=object(value),topics=object(patch.topics);
 const next={...state,topics:Object.fromEntries(Object.entries(state.topics).map(([id,item])=>[id,{...item}]))};
 for(const repair of repairs)if(repair.topicId){
  const value=object(topics[repair.topicId])[repair.field];
  if(repair.field==='battle'){const battle=normaliseShareEnBattle(value,report,repair.topicId);if(battle)next.topics[repair.topicId].battle=battle;}
  else if(isEnglish(value))next.topics[repair.topicId][repair.field]=value;
 }
 if(repairs.some(r=>r.field==='highlightIds')){
  const ids=patch.highlightIds;
  if(Array.isArray(ids)&&ids.length>=2&&ids.length<=3&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&report.topics.slice(0,10).some(t=>t.id===id))){
   next.highlightIds=ids;
   for(const id of ids as string[])for(const field of fields){
    const value=object(topics[id])[field];
    if(field==='battle'){const battle=normaliseShareEnBattle(value,report,id);if(!resolveShareEnBattle(report,id,next.topics[id].battle)&&battle)next.topics[id].battle=battle;}
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
 const highlights=(state.highlightIds as string[]).map(topicId=>{const battle=resolveShareEnBattle(report,topicId,state.topics[topicId].battle);return {...(battle?{battle}:{}),topicId,hook:clean(state.topics[topicId].hook),whatHappened:clean(state.topics[topicId].whatHappened),context:'',whyItMatters:clean(state.topics[topicId].whyItMatters)};});
 const legacyTop3=Array.isArray(state.top3)?state.top3.map(object):[];
 const top3=[...originalTopics(report)].sort((a,b)=>a.rank-b.rank).slice(0,3).map(t=>{
  const legacy=legacyTop3.filter(item=>item.topicId===t.id);
  return {topicId:t.id,summary:legacy.length===1&&isEnglish(legacy[0].summary)?legacy[0].summary.trim():topics.find(item=>item.id===t.id)!.title};
 });
 const rawPosts=Array.isArray(state.posts)?state.posts.map(object).filter(p=>isEnglish(p.text)).slice(0,3):[];
 const defaults=[{id:'digest',template:'daily_digest',text:'Today on the Chinese internet.',reason:'Three stories from the original daily ranking.'},{id:'bridge',template:'global_bridge',text:'China’s daily trends, in context.',reason:'A brief introduction for readers abroad.'}];
 const candidates=[...rawPosts];
 while(candidates.length<2)candidates.push(defaults[candidates.length===0?0:1]);
 const seen=new Set<string>();
 const posts=candidates.map((p,index)=>{
  const proposed=typeof p.id==='string'&&p.id.trim()?p.id.trim():`post-${index+1}`;
  let id=proposed;while(seen.has(id))id=`${id}-${index+1}`;seen.add(id);
  return {id,template:typeof p.template==='string'&&p.template.trim()?p.template.trim():'daily_digest',reason:typeof p.reason==='string'&&p.reason.trim()?p.reason.trim():'Original daily Top3.',text:`WcCAT Daily Hot\n\n${clean(p.text)}\n\n${top3.map((t,i)=>`${['1️⃣','2️⃣','3️⃣'][i]} ${t.summary}`).join('\n')}\n\nWcCAT: read the cards. CHINA, IN CONTEXT.`};
 });
 return {overview:{headline:`China’s Top ${topics.length}`,summary:'',topics},highlights,top3,posts,selectedPostId:typeof state.selectedPostId==='string'&&seen.has(state.selectedPostId)?state.selectedPostId:posts[0].id,altTexts:[`WcCAT Daily Hot, ${report.reportDate}. China’s Top ${topics.length}: ${topics.map(t=>t.title).join('; ')}.`,...highlights.map(h=>`${h.hook}. ${h.whatHappened} ${h.whyItMatters}${h.battle?` Debate energy (${h.battle.basis==='analysis'?'existing analysis':'AI estimate'}): ${h.battle.redLabel} ${h.battle.redScore}, ${h.battle.blueLabel} ${h.battle.blueScore}. ${h.battle.redRationale} ${h.battle.blueRationale}`:''}`)]};
}
