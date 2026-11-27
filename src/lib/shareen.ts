import {newsroomPrompt} from './newsroom/prompts';
import {cleanGeneratedNewsValue} from './newsroom/prose';
import {createHash} from 'node:crypto';
import type {GenerationLog,WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {redactJobMessage} from './log-redaction';
import {hasSourceShareEnBattle} from './shareen-battle';
import {parseShareEnJson} from './shareen-json';
import {readShareEnDraft,shareEnRepairs,applyShareEnRepair,completeShareEnDraft,shareEnSupportedTopicIds,shareEnEditorialSource,type ShareEnDraftState} from './shareen-draft';
import {validateShareEnStructure,type ShareEnValidationOptions} from './shareen-validation';
import {recommendTopic} from './topic-sharing/recommendation';
export type {ShareEnValidationOptions} from './shareen-validation';

/** A Chinese revision's identity never changes merely because either sharing format is saved. */
export function sourceFingerprint(report:WccatDailyReport):string {
 const source=Object.fromEntries(Object.entries(report).filter(([key])=>!['shareEn','shareEnglish','sharingSourceFingerprint'].includes(key)));
 return createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');
}
/** Optimistic concurrency token for the exact saved cache, including edits and regenerated copies. */
export function shareEnRevision(copy:ShareEnCopy|undefined):string {
 return createHash('sha256').update(JSON.stringify(canonical(copy??null))).digest('hex');
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
/** Shared draft checks are browser-safe; only this server wrapper verifies Chinese source identity. */
export function validateShareEn(value:unknown,report:WccatDailyReport,options:ShareEnValidationOptions={}):ShareEnCopy {
 const checked=validateShareEnStructure(value,report,options);
 if(checked.sourceFingerprint!==sourceFingerprint(report))throw new Error('ShareEn source fingerprint changed');
 return checked;
}
export function getValidShareEn(report:WccatDailyReport):ShareEnCopy|undefined {
 if(!report.shareEn)return undefined;
 try{return validateShareEn(report.shareEn,report);}catch{return undefined;}
}
/** A missing or failed optional version leaves the daily report usable. No new factual research is performed. */
export async function generateShareEn(report:WccatDailyReport,log?:GenerationLog):Promise<ShareEnCopy|undefined>{
 const emit=(level:'info'|'warn',message:string)=>log?log(level,message):console[level]('[WcCAT] '+redactJobMessage(message));
 if(!report.topics.length){emit('info','ShareEn 没有日榜话题，已跳过');return undefined;}
 const cached=getValidShareEn(report);if(cached)return cached;
 const reportingPolicy=report.topics.some(topic=>topic.research)?'current-news-v1' as const:undefined;
 const draftOptions={layout:'editorial' as const,...(reportingPolicy?{reportingPolicy}:{})};
 const supportedTopicIds=shareEnSupportedTopicIds(report,!!reportingPolicy);
 if(!supportedTopicIds.length){emit('info','ShareEn 仅有标题，缺少可支持故事卡的事实材料，已跳过');return undefined;}
 const key=process.env.DEEPSEEK_API_KEY,model=process.env.DEEPSEEK_MODEL??'deepseek-flash';
 if(!key){emit('warn','未配置 DEEPSEEK_API_KEY，ShareEn 未生成');return undefined;}
 const source={reportDate:report.reportDate,editorial:{layout:'editorial',highlightCount:Math.min(3,supportedTopicIds.length),supportedTopicIds},topics:report.topics.slice(0,10).map(t=>({id:t.id,rank:t.rank,title:t.title,oneLine:t.oneLine,whyItMatters:t.whyItMatters,sources:t.sources,links:t.links,analysis:t.aiAnalysis,currentReporting:t.research?.documents.filter(doc=>doc.purpose==='event'),readerComments:t.readerComments,...(t.relatedDevelopments?.length?{relatedDevelopments:t.relatedDevelopments.map(stage=>({title:stage.title,summary:stage.aiAnalysis?.summary,detail:stage.aiAnalysis?.detailedContent,context:stage.aiAnalysis?.outsiderContext,links:stage.links}))}:{}),column:recommendTopic(shareEnEditorialSource(report,t.id),{commentLanguage:'en'}).column}))};
 const system=newsroomPrompt('shareen');
 const request=async(messages:Array<{role:'system'|'user';content:string}>)=>{
  const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model,response_format:{type:'json_object'},thinking:{type:'disabled'},temperature:0.4,max_tokens:6500,messages})}).catch(()=>{throw new Error('DeepSeek ShareEn request failed');});
  if(!response.ok)throw new Error(`DeepSeek ShareEn HTTP ${response.status}`);
  const payload=await response.json().catch(()=>{throw new Error('DeepSeek ShareEn response body unreadable');}) as {choices?:Array<{finish_reason?:string;message?:{content?:string}}>};
  const choice=payload.choices?.[0];
  if(choice?.finish_reason==='length')throw new SyntaxError('ShareEn response truncated');
  const content=choice?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new SyntaxError('ShareEn response empty');
  return cleanGeneratedNewsValue(parseShareEnJson(content));
 };
 try{
  let state:ShareEnDraftState;
  try{state=readShareEnDraft(await request([{role:'system',content:system},{role:'user',content:JSON.stringify(source)}]),report,draftOptions);}
  catch(error){
   if(error instanceof Error&&error.message.startsWith('DeepSeek ShareEn'))throw error;
   if(error instanceof Error&&error.name==='TimeoutError')throw error;
   emit('warn',`ShareEn 初稿结构无法读取，将仅补齐必要字段：${error instanceof Error?error.message:'Invalid draft'}`);
   state=readShareEnDraft({},report,draftOptions);
  }
  const repairs=shareEnRepairs(state,report);
  if(repairs.length){
   emit(repairs.some(r=>r.required)?'warn':'info',`ShareEn 局部修复 ${repairs.length} 个字段，保留其余已生成内容`);
   const ids=new Set(repairs.filter(r=>r.topicId).map(r=>r.topicId));
   if(repairs.some(r=>r.field==='highlightIds'))source.topics.forEach(t=>ids.add(t.id));
   try{
   const patch=await request([{role:'system',content:system},{role:'user',content:JSON.stringify({task:'repair only the requested fields; return {topics:{id:{requestedField:value}},highlightIds?}. Do not rewrite valid fields, posts, metadata or Top3. If highlightIds is requested, follow its requested supported-story count and return original IDs with complete hook/whatHappened/whyItMatters and battle (object or explicit null) for those choices.',repairs,source:{reportDate:source.reportDate,editorial:source.editorial,topics:source.topics.filter(t=>ids.has(t.id))}})}]);
    state=applyShareEnRepair(state,patch,repairs,report);
   }catch(error){
    if(repairs.some(r=>r.required))throw error;
    emit('info','ShareEn 局部修复未成功，保留完整文案；请检查焦点情绪条和排版');
   }
  }
  const copy=validateShareEn({...completeShareEnDraft(state,report),version:1,generatedAt:new Date().toISOString(),model,sourceFingerprint:sourceFingerprint(report)},report,{onWarning:message=>emit('info',message)});
  for(const h of copy.highlights){
   const prefix=`ShareEn 焦点 原榜 #${report.topics.find(t=>t.id===h.topicId)?.rank??'?'} 情绪条`;
   if(h.battle)emit('info',`${prefix}已就绪（${h.battle.basis==='analysis'?'已有分析':'AI 估计'}）`);
   else if(state.topics[h.topicId]?.battle===null&&!hasSourceShareEnBattle(report,h.topicId))emit('info',`${prefix}未生成：材料不足，未编造比例`);
   else emit('warn',`${prefix}补齐未成功，文案已保留${hasSourceShareEnBattle(report,h.topicId)?'；已有分析的英文短句仍待补齐':''}`);
  }
  return copy;
 }catch(error){emit('warn',`ShareEn unavailable: ${error instanceof Error?error.message:'Unknown error'}`);return undefined;}
}
