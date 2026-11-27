import type {WccatDailyReport} from './daily-report';
import type {ShareEnCopy} from './shareen-types';
import {numericalFacts,sameNumericalFacts} from './translation-facts';
import {parseAllowedImageUrl,isGeneratedImageUrl} from './image-proxy';
import {normaliseShareEnBattle,resolveShareEnBattle} from './shareen-battle';
import {validateImageAsset} from './shareen-image-types';
import {readShareEnCaptionLine} from './shareen-caption';
import {shareEnEditorialSource,validShareEnHighlightIds} from './shareen-draft';
import {eligibleColumns} from './topic-sharing/recommendation';
import type {EditorialColumn} from './topic-sharing/types';

export type ShareEnValidationOptions={onWarning?:(message:string)=>void};
function record(value:unknown,path:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Missing object: ${path}`);
 return value as Record<string,unknown>;
}
function text(value:unknown,path:string,english=true):string {
 if(typeof value!=='string'||!value.trim())throw new Error(`Missing text: ${path}`);
 const clean=value.trim();
 if(english&&(/\p{Script=Han}/u.test(clean)||!/[a-z]/i.test(clean)))throw new Error(`Incomplete English: ${path}`);
 return clean;
}
function list(value:unknown,path:string):unknown[]{if(!Array.isArray(value))throw new Error(`Missing list: ${path}`);return value;}
function originalTop3(report:WccatDailyReport){return [...report.topics].sort((a,b)=>a.rank-b.rank).slice(0,3);}

/** Schema and source identities are blocking; numerical/length diagnostics never reject usable copy. */
export function validateShareEnStructure(value:unknown,report:WccatDailyReport,options:ShareEnValidationOptions={}):ShareEnCopy {
 const data=record(value,'ShareEn');
 if(data.version!==1)throw new Error('Unsupported ShareEn version');
 if(data.layout!==undefined&&data.layout!=='editorial')throw new Error('Unknown ShareEn layout');
 if(data.reportingPolicy!==undefined&&data.reportingPolicy!=='current-news-v1')throw new Error('Unknown ShareEn reporting policy');
 const reportingPolicy=data.reportingPolicy==='current-news-v1'?'current-news-v1' as const:undefined;
 const editorial=data.layout==='editorial';
 const fingerprint=text(data.sourceFingerprint,'sourceFingerprint',false);
 if(!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error('Invalid ShareEn source fingerprint');
 const generatedAt=text(data.generatedAt,'generatedAt',false);
 if(!Number.isFinite(Date.parse(generatedAt)))throw new Error('Invalid generatedAt');
 const model=text(data.model,'model',false),overview=record(data.overview,'overview');
 const expected=report.topics.slice(0,10),topics=list(overview.topics,'overview.topics');
 if(topics.length!==expected.length)throw new Error('Incomplete overview topic identities');
 const checkedTopics=topics.map((item,index)=>{
  const topic=record(item,`overview.topics[${index}]`);
  if(topic.id!==expected[index].id)throw new Error('Changed overview identity/order');
  return {id:expected[index].id,title:text(topic.title,`overview.topics[${index}].title`)};
 });
 const highlights=list(data.highlights,'highlights');
 if(!editorial&&(highlights.length<2||highlights.length>3))throw new Error('ShareEn requires 2–3 highlights');
 const ids=new Set<string>();
 const checkedHighlights=highlights.map((item,index)=>{
  const h=record(item,`highlights[${index}]`);
  if(typeof h.topicId!=='string'||!expected.some(t=>t.id===h.topicId))throw new Error('Unknown highlight topic identity');
  if(ids.has(h.topicId))throw new Error('Duplicate highlight topic');ids.add(h.topicId);
  let column:EditorialColumn|undefined;
  if(h.column!==undefined||editorial){
   const allowed=eligibleColumns(shareEnEditorialSource(report,h.topicId),{commentLanguage:'en'});
   if(!allowed.includes(h.column as EditorialColumn))throw new Error('Editorial column unavailable for saved comment evidence');
   column=h.column as EditorialColumn;
  }
  let imageUrl:string|undefined;
  if(h.hideImage!==undefined&&typeof h.hideImage!=='boolean')throw new Error('Invalid hideImage option');
  let hideImage=h.hideImage;
  if(h.imageUrl!==undefined&&h.imageUrl!==''){
   if(typeof h.imageUrl!=='string')throw new Error('Invalid highlight image URL');
   let source:URL;
   try{source=parseAllowedImageUrl(h.imageUrl.trim());}catch{throw new Error('Unapproved highlight image URL');}
   if(isGeneratedImageUrl(source)){
    // Previously permitted overrides can be retired without disabling the saved story or its text editor.
    const saved=report.shareEn?.highlights?.find(item=>item.topicId===h.topicId);
    if(saved?.imageUrl!==h.imageUrl)throw new Error('Unapproved highlight image URL');
    hideImage=true;
   }else imageUrl=source.href;
  }
  const imageAsset=validateImageAsset(h.imageAsset);
  const battle=h.battle===undefined?undefined:normaliseShareEnBattle(h.battle,report,h.topicId);
  if(column==='voices'&&!resolveShareEnBattle(report,h.topicId,battle))throw new Error('Voices column requires displayable saved comment evidence');
  if(h.battle!==undefined&&!battle)options.onWarning?.('ShareEn optional debate content omitted; article remains usable.');
  return {...(column?{column}:{}),...(imageAsset?{imageAsset}:{}),...(imageUrl?{imageUrl}:{}),...(hideImage!==undefined?{hideImage}:{}),...(battle?{battle}:{}),topicId:h.topicId,hook:text(h.hook,'highlight.hook'),whatHappened:text(h.whatHappened,'highlight.whatHappened'),context:typeof h.context==='string'?h.context.trim():'',whyItMatters:text(h.whyItMatters,'highlight.whyItMatters')};
 });
 if(editorial&&!validShareEnHighlightIds(checkedHighlights.map(h=>h.topicId),report,true,reportingPolicy))throw new Error('Invalid editorial highlight selection: use the supported source stories');
 if(data.captionBasis!==undefined&&data.captionBasis!=='highlights')throw new Error('Unknown caption basis');
 const top3=list(data.top3,'top3'),top=data.captionBasis==='highlights'?checkedHighlights.map(h=>expected.find(t=>t.id===h.topicId)!):originalTop3(report);
 if(top3.length!==top.length)throw new Error('Incomplete top3 summaries');
 const checkedTop3=top3.map((item,index)=>{
  const t=record(item,`top3[${index}]`);
  if(t.topicId!==top[index].id)throw new Error('Changed top3 identity/order');
  return {topicId:top[index].id,summary:text(t.summary,`top3[${index}].summary`)};
 });
 const posts=list(data.posts,'posts');
 if(posts.length<2||posts.length>3)throw new Error('ShareEn requires 2–3 post candidates');
 const postIds=new Set<string>();
 const checkedPosts=posts.map(item=>{
  const p=record(item,'post'),id=text(p.id,'post.id',false);
  if(postIds.has(id))throw new Error('Duplicate post identity');postIds.add(id);
  const body=text(p.text,'post.text');
  if(!editorial&&!/^WcCAT Daily Hot:?(?: 🇨🇳)?\r?\n/u.test(body))throw new Error('Missing WcCAT post branding');
  if(data.captionBasis==='highlights'){
   const numbered=body.split(/\r?\n/u).flatMap(line=>{const entry=readShareEnCaptionLine(line);return entry?[entry]:[];});
   if(numbered.length!==checkedTop3.length||checkedTop3.some((t,i)=>numbered[i].position!==i+1||numbered[i].summary!==t.summary))throw new Error('Changed Top3 caption identity/order or summary');
  }else checkedTop3.forEach((t,i)=>{if(!body.includes(`${['1️⃣','2️⃣','3️⃣'][i]} ${t.summary}`))throw new Error('Missing original Top3 in post');});
  if(!/WcCAT[^\n]*(cards|read|context|follow)/i.test(body.split('\n').at(-1)??''))throw new Error('Missing WcCAT branded reading CTA');
  return {id,template:text(p.template,'post.template',false),text:body,reason:text(p.reason,'post.reason',false)};
 });
 if(editorial&&(new Set(checkedPosts.map(p=>p.template)).size!==checkedPosts.length||checkedPosts.some(p=>!['specific_observation','source_quote','contextual_number','counterpoint','culture_translation','update'].includes(p.template))))throw new Error('Editorial candidates require distinct supported copy patterns');
 const selectedPostId=text(data.selectedPostId,'selectedPostId',false);
 if(!postIds.has(selectedPostId))throw new Error('Unknown selectedPostId');
 const altTexts=list(data.altTexts,'altTexts');
 if(altTexts.length!==highlights.length+1)throw new Error('Incomplete card altTexts');
 const checked:ShareEnCopy={version:1,generatedAt,model,sourceFingerprint:fingerprint,...(editorial?{layout:'editorial' as const}:{}),...(reportingPolicy?{reportingPolicy}:{}),...(data.captionBasis==='highlights'?{captionBasis:'highlights' as const}:{}),overview:{headline:text(overview.headline,'overview.headline'),summary:typeof overview.summary==='string'?overview.summary.trim():'',topics:checkedTopics},highlights:checkedHighlights,top3:checkedTop3,posts:checkedPosts,selectedPostId,altTexts:altTexts.map((t,i)=>text(t,`altTexts[${i}]`))};
 const sourceText=[report.headline,report.overview,...report.topics.map(t=>[t.title,t.oneLine,t.whyItMatters].join(' '))].join(' ');
 const englishText=[checked.overview.headline,checked.overview.summary,...checked.overview.topics.map(t=>t.title),...checked.highlights.flatMap(h=>[h.hook,h.whatHappened,h.context,h.whyItMatters])].join(' ');
 try{
  if(!sameNumericalFacts(numericalFacts(sourceText),numericalFacts(englishText)))options.onWarning?.('ShareEn numerical wording differs from source; accepted without retry.');
 }catch{options.onWarning?.('ShareEn numerical wording could not be compared; accepted without retry.');}
 if(checked.overview.summary.split(/\s+/).length>45||checked.highlights.some(h=>[h.whatHappened,h.whyItMatters].join(' ').split(/\s+/).length>70))options.onWarning?.('ShareEn copy exceeds target card budget; check the fixed-size preview before export.');
 return checked;
}
