import {newsroomPrompt,newsroomJsonRepairPrompt,newsroomStructureRepairPrompt} from '../newsroom/prompts';
import {cleanGeneratedNewsValue} from '../newsroom/prose';
import {topicReaderComments} from './readers';
import {parseShareEnJson} from '../shareen-json';
import {eligibleColumns,recommendTopic,usableTopicQuotes} from './recommendation';
import {prepareTopicShareDraft,topicShareNumericalEvidence,TopicShareStructureError,assertTopicShareModelBoundary} from './validation';
import {TOPIC_SHARE_POST_PATTERNS,TOPIC_NEWS_POLICY} from './contract';
import {EDITORIAL_COLUMNS} from './columns';
import type {EditorialColumn,TopicShareCopy,TopicShareSource} from './types';

type GenerationOptions={column?:EditorialColumn;fetch?:typeof fetch;now?:()=>number;log?:(level:'info'|'warn'|'error',message:string)=>void};
const briefs:Record<EditorialColumn,string>={
 inside:"Explain the concrete event and the cultural meaning an unfamiliar reader needs.",
 voices:"Lead with the sourced individual voices and explain their situation and language.",
 tech:"Explain the concrete technology or product change and its documented practical consequences."
};
const system=newsroomPrompt('topic');
class JsonEnvelopeError extends SyntaxError {constructor(readonly content:string){super('Model returned malformed JSON');}}
/** One draft request plus at most one protocol/structure repair; editorial checks only warn. */
export async function generateTopicShare(source:TopicShareSource,options:GenerationOptions={}):Promise<TopicShareCopy>{
 const frozen=structuredClone(source),column=options.column??recommendTopic(frozen).column;
 if(!EDITORIAL_COLUMNS.some(item=>item.id===column))throw new Error('Unknown editorial column');
 if(!eligibleColumns(frozen).includes(column))options.log?.('warn','栏目与现有材料可能不完全匹配，仍将生成可编辑草稿。');
 const key=process.env.DEEPSEEK_API_KEY,model=process.env.DEEPSEEK_MODEL??'deepseek-flash';
 if(!key){options.log?.('warn','DEEPSEEK_API_KEY is not configured; existing topic share draft preserved.');throw new Error('DEEPSEEK_API_KEY is not configured; existing topic share draft preserved');}
 const readers=topicReaderComments(frozen);
 const commentEvidence=Object.fromEntries((['en','zh'] as const).map(language=>[language,readers.length?readers.map(quote=>({quoteId:quote.id,text:language==='en'?quote.englishText??quote.text:quote.text,sourceName:quote.sourceName})):usableTopicQuotes(frozen,language).map(item=>({quoteId:item.quote.id,text:item.text,sourceName:item.quote.sourceName}))]));
 const commentEvidenceAvailable=Object.fromEntries((['en','zh'] as const).map(language=>[language,commentEvidence[language].length>0]));
 const numericalEvidence=topicShareNumericalEvidence(frozen);
 const allowedPatterns=TOPIC_SHARE_POST_PATTERNS.filter(pattern=>(pattern!=='source_voice'||commentEvidenceAvailable.en&&commentEvidenceAvailable.zh)&&(pattern!=='number_context'||numericalEvidence.numbers.length>0||numericalEvidence.ratios.length>0));
 const hasEvent=frozen.research?.documents.some(doc=>doc.purpose==='event');
 const payload={column,editorialBrief:briefs[column],allowedPatterns,source:{title:frozen.title,sourceReportDate:frozen.date,researchCheckedAt:frozen.research?.checkedAt,...(!hasEvent?{summary:frozen.summary,detail:frozen.detail,context:frozen.context}:{}),researchDocuments:[...(frozen.research?.documents??[])].sort((a,b)=>Number(b.purpose==='event')-Number(a.purpose==='event')),attitudes:frozen.analysis?.battle?{redLabel:frozen.analysis.battle.redLabel,blueLabel:frozen.analysis.battle.blueLabel}:undefined,image:frozen.photo?{publisher:frozen.photo.publisher,sourcePage:frozen.photo.pageUrl}:undefined,commentEvidence,commentEvidenceAvailable}};
 options.log?.('info','Generating short bilingual covers and companion articles from frozen reporting evidence.');
 const request=async(messages:Array<{role:'system'|'user';content:string}>,maxTokens:number,temperature=0.45):Promise<unknown>=>{
  let response:Response;
  try{
   response=await (options.fetch??fetch)('https://api.deepseek.com/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model,response_format:{type:'json_object'},thinking:{type:'disabled'},temperature,max_tokens:maxTokens,messages})});
  }catch(error){
   if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError'))throw new Error('DeepSeek topic share request timed out; existing draft preserved');
   throw new Error('DeepSeek topic share request failed; existing draft preserved');
  }
  if(!response.ok)throw new Error(`DeepSeek topic share HTTP ${response.status}; existing draft preserved`);
  const result=await response.json().catch(()=>{throw new Error('DeepSeek topic share response JSON is unreadable');}) as {choices?:Array<{finish_reason?:string;message?:{content?:string}}>};
  const choice=result.choices?.[0];
  if(choice?.finish_reason==='length')throw new Error('DeepSeek topic share response reached the token limit');
  const content=choice?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new Error('DeepSeek topic share response is empty');
  try{return parseShareEnJson(content);}catch(error){if(error instanceof SyntaxError)throw new JsonEnvelopeError(content);throw error;}
 };
 try{
  let data:unknown;
  let recoveryUsed=false;
  try{data=await request([{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}],9000);}
  catch(error){
   if(!(error instanceof JsonEnvelopeError))throw error;
   recoveryUsed=true;
   options.log?.('warn','模型响应 JSON 格式异常，正在仅修复一次序列化格式；不执行翻译或措辞重审。');
   data=await request([{role:'system',content:newsroomJsonRepairPrompt},{role:'user',content:JSON.stringify({invalidJson:error.content})}],9000,0);
  }
  const prepare=(value:unknown)=>{
   assertTopicShareModelBoundary(value);
   if(!value||typeof value!=='object'||Array.isArray(value))throw new TopicShareStructureError('DeepSeek topic share content is not a JSON object');
   const draft=cleanGeneratedNewsValue(value) as Record<string,unknown>;
   if(Object.keys(draft).some(key=>!['column','en','zh'].includes(key)))throw new Error('DeepSeek topic share returned unexpected source-owned or metadata fields');
   const metadata={version:1,generatedAt:new Date((options.now??Date.now)()).toISOString(),model,sourceFingerprint:frozen.fingerprint,column,editorialPolicy:TOPIC_NEWS_POLICY};
   return {...prepareTopicShareDraft({...metadata,en:draft.en,zh:draft.zh},frozen),column:draft.column};
  };
  let prepared:ReturnType<typeof prepare>;
  try{prepared=prepare(data);}
  catch(error){
   if(!(error instanceof TopicShareStructureError)||recoveryUsed)throw error;
   recoveryUsed=true;
   options.log?.('warn','模型文案字段结构异常，正在仅修复一次结构；不执行翻译或措辞重审。');
   data=await request([{role:'system',content:system+'\n\n'+newsroomStructureRepairPrompt},{role:'user',content:JSON.stringify({invalidDraft:data})}],9000,0);
   prepared=prepare(data);
  }
  const {copy,reviewWarnings}=prepared;
  if(prepared.column!==undefined&&prepared.column!==column)options.log?.('warn','模型返回的栏目与所选栏目不同，已保留管理员选择的栏目及生成文字。');
  if(reviewWarnings.length)options.log?.('warn',`草稿已保留，${reviewWarnings.length} 项编辑提示待人工核对：${reviewWarnings.map(item=>`${item.path} [${item.code}]`).join('; ')}`);
  options.log?.('info','Bilingual topic share draft generated; editorial decisions remain with the administrator.');
  return copy;
 }catch(error){
  // Keep response bodies, untrusted keys and credentials out of job logs.
  options.log?.('warn','Bilingual topic share generation failed; existing draft preserved.');
  throw error;
 }
}
