import {numericalFacts,type NumericalFacts} from '../translation-facts';
import {eligibleColumns,usableTopicQuotes} from './recommendation';
import type {EditorialColumn,LocalizedTopicShare,TopicShareCopy,TopicShareLanguage,TopicShareSource,TopicShareReviewWarning} from './types';
import {EDITORIAL_COLUMNS} from './columns';
import {TOPIC_REVIEW_MESSAGES} from './review-labels';
import {TOPIC_SHARE_CONTRACT,TOPIC_SHARE_POST_PATTERNS,topicShareFieldLimit} from './contract';
export {TOPIC_SHARE_POST_PATTERNS} from './contract';

export type TopicShareCopyIssue={path:string;code:'missing_text'|'length'|'language'|'duplicate_text'|'pattern'|'selection'|'population'|'quotation'|'candidate_count'|'reply_count'|'column_evidence'|'link'|'review_unavailable'|'comment_translation'|'editorial_style';message:string};
export type TopicShareRepairIssue=TopicShareCopyIssue|(TopicShareNumericIssue&{code:'numerical'})|(TopicShareCommentIssue&{code:'comment_evidence'});
export class TopicShareCopyError extends Error {
 constructor(readonly issues:TopicShareRepairIssue[]){
  super(`Topic share copy validation: ${issues.slice(0,12).map(issue=>`${issue.path} [${issue.code}]${'message' in issue?': '+issue.message:''}`).join('; ')}`);
  this.name='TopicShareCopyError';
 }
}

function object(value:unknown,path:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Missing object: ${path}`);
 return value as Record<string,unknown>;
}
function fields(value:Record<string,unknown>,allowed:readonly string[],path:string){
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`Unexpected source-owned or unknown field: ${path}.${key}`);
}
const chars=(text:string)=>Array.from(text).length;
const words=(text:string)=>text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length??0;
function text(value:unknown,path:string,max:number,language?:TopicShareLanguage,maxWords?:number,issues?:TopicShareCopyIssue[]):string {
 if(issues&&(value===undefined||value===null))value='';
 if(typeof value!=='string')throw new Error(`Missing text: ${path}`);
 const clean=value.trim();
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(clean))throw new Error(`Unsafe control character: ${path}`);
 const report=(code:TopicShareCopyIssue['code'],message:string)=>{if(issues)issues.push({path,code,message});else throw new Error(`${message}: ${path}`);};
 if(!clean)report('missing_text','Missing text');
 if(chars(clean)>max||(maxWords!==undefined&&words(clean)>maxWords))report('length',`Text length exceeds limit${maxWords!==undefined?' in words':''}`);
 if(language==='en'&&(/\p{Script=Han}/u.test(clean)||!/[a-z]/i.test(clean)))report('language','Incomplete English or Han text');
 if(language==='zh'&&!/\p{Script=Han}/u.test(clean))report('language','Missing independently localized Chinese');
 return clean;
}
function localized(value:unknown,language:TopicShareLanguage,issues:TopicShareCopyIssue[],newsStyle=false):LocalizedTopicShare {
 const data=object(value??{},language);
 const checked=(value:unknown,path:string)=>{const limit=topicShareFieldLimit(path);return text(value,path,limit.maxChars,limit.language,limit.maxWords,issues);};
 fields(data,['headline','hook','summary','context','whyItMatters','question','posts','selectedPostId','replies','altText','article'],language);
 const optional=(field:string)=>newsStyle&&(data[field]===undefined||data[field]===null||typeof data[field]==='string'&&!data[field].trim())?'':checked(data[field],language+'.'+field);
 let article:LocalizedTopicShare['article'];
 if(data.article!==undefined){const row=object(data.article,language+'.article');fields(row,['title','body'],language+'.article');article={title:checked(row.title,language+'.article.title'),body:checked(row.body,language+'.article.body')};}
 else if(newsStyle)issues.push({path:language+'.article',code:'missing_text',message:'Companion article is missing; the cover draft is preserved'});
 if(data.posts===undefined||Array.isArray(data.posts)&&!data.posts.length)data.posts=[{id:`draft-${language}`,pattern:'context',text:'',reason:''}];
 if(!Array.isArray(data.posts))throw new Error(`Invalid post candidates: ${language}.posts`);
 if(data.posts.length!==TOPIC_SHARE_CONTRACT.postCount)issues.push({path:language+'.posts',code:'candidate_count',message:'Expected three post candidates'});
 const ids=new Set<string>(),bodies=new Set<string>(),patterns=new Set<string>();
 const posts=data.posts.map((value,index)=>{
  const path=`${language}.posts[${index}]`,post=object(value,path);
  fields(post,['id','pattern','text','reason'],path);
  const id=text(post.id,path+'.id',80),pattern=checked(post.pattern,path+'.pattern'),body=checked(post.text,path+'.text');
  if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))throw new Error(`Invalid or duplicate post candidate id: ${path}`);
  if(!(TOPIC_SHARE_POST_PATTERNS as readonly string[]).includes(pattern)||patterns.has(pattern))issues.push({path:path+'.pattern',code:'pattern',message:'Invalid or duplicate post candidate pattern'});
  const normalized=body.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLocaleLowerCase();
  if(bodies.has(normalized))issues.push({path:path+'.text',code:'duplicate_text',message:'Duplicate post candidate text'});
  ids.add(id);bodies.add(normalized);patterns.add(pattern);
  return {id,pattern,text:body,reason:checked(post.reason,path+'.reason')};
 });
 const selectedPostId=checked(data.selectedPostId,language+'.selectedPostId');
 if(!ids.has(selectedPostId))issues.push({path:language+'.selectedPostId',code:'selection',message:'Unknown selected post candidate'});
 if(data.replies===undefined||data.replies===null)data.replies=[];
 if(!Array.isArray(data.replies))throw new Error(`Invalid replies: ${language}.replies`);
 if(data.replies.length>TOPIC_SHARE_CONTRACT.maxReplies)issues.push({path:language+'.replies',code:'reply_count',message:'Reply count exceeds suggested limit'});
 return {
  headline:checked(data.headline,language+'.headline'),hook:optional('hook'),
  summary:checked(data.summary,language+'.summary'),context:optional('context'),
  whyItMatters:checked(data.whyItMatters,language+'.whyItMatters'),question:optional('question'),
  posts,selectedPostId,replies:data.replies.map((reply,index)=>checked(reply,`${language}.replies[${index}]`)),
  altText:checked(data.altText,language+'.altText'),...(article?{article}:{})
 };
}
function visibleTexts(copy:LocalizedTopicShare,language:TopicShareLanguage):Array<{path:string;body:string}>{
 return [...(['headline','hook','summary','context','whyItMatters','question','altText'] as const).map(field=>({path:`${language}.${field}`,body:copy[field]})),...(copy.article?[{path:`${language}.article.title`,body:copy.article.title},{path:`${language}.article.body`,body:copy.article.body}]:[]),...copy.posts.map((post,index)=>({path:`${language}.posts[${index}].text`,body:post.text})),...copy.replies.map((body,index)=>({path:`${language}.replies[${index}]`,body}))];
}
function missingFacts<T>(source:T[],target:T[],key:(value:T)=>string=String):T[] {
 const allowed=new Set(source.map(key));return [...new Map(target.filter(value=>!allowed.has(key(value))).map(value=>[key(value),value])).values()];
}
export type TopicShareNumericIssue={path:string;unsupported:NumericalFacts};
export type TopicShareCommentIssue={path:string;reason:'missing_saved_comment_evidence'};
export class TopicShareCommentError extends Error {
 constructor(readonly issues:TopicShareCommentIssue[],readonly numericalIssues:TopicShareNumericIssue[]=[]){
  super(`Comment claim lacks usable saved source evidence: ${issues.map(issue=>issue.path).join(', ')}`);
  this.name='TopicShareCommentError';
 }
}
export class TopicShareNumericalError extends Error {
 constructor(readonly issues:TopicShareNumericIssue[]){
  const details=issues.slice(0,8).map(({path,unsupported})=>{
   const values=[...unsupported.numbers.map(value=>value.replace(/\/1$/u,'')),...unsupported.ratios.map(value=>`${value.bound} ratio ${value.value}`),...unsupported.dates,...unsupported.seasons.map(value=>`season ${value}`),...Object.entries(unsupported.roles).flatMap(([role,values])=>values.map(value=>`${role} ${value}`))];
   return `${path} (${values.slice(0,8).map(value=>value.slice(0,80)).join(', ')})`;
  });
  super(`Ungrounded numerical fact or number role: ${details.join('; ')}`);
  this.name='TopicShareNumericalError';
 }
}
/** All editable content failures share one repair protocol. Security/schema errors do not. */
export function topicShareRepairIssues(error:unknown):TopicShareRepairIssue[]|undefined {
 if(error instanceof TopicShareCopyError)return error.issues;
 if(error instanceof TopicShareNumericalError)return error.issues.map(issue=>({...issue,code:'numerical'}));
 if(error instanceof TopicShareCommentError)return [
  ...error.numericalIssues.map(issue=>({...issue,code:'numerical' as const})),
  ...error.issues.map(issue=>({...issue,code:'comment_evidence' as const}))
 ];
}
function unsupportedNumbers(source:NumericalFacts,target:NumericalFacts):NumericalFacts|undefined {
 const roles=Object.fromEntries(Object.entries(target.roles).map(([role,values])=>[role,missingFacts(source.roles[role]??[],values)]).filter(([,values])=>values.length));
 const result={numbers:missingFacts(source.numbers,target.numbers),ratios:missingFacts(source.ratios,target.ratios,value=>JSON.stringify(value)),seasons:missingFacts(source.seasons,target.seasons),dates:missingFacts(source.dates,target.dates),roles};
 return result.numbers.length||result.ratios.length||result.seasons.length||result.dates.length||Object.keys(roles).length?result:undefined;
}
function sourceFacts(source:TopicShareSource):string {
 return [source.title,source.summary,source.detail,source.context,source.analysis?.summary,source.analysis?.detailedContent,source.analysis?.outsiderContext,...source.links.map(link=>link.title),...(source.research?.documents??[]).flatMap(doc=>[doc.title,doc.text]),...(['en','zh'] as const).flatMap(language=>usableTopicQuotes(source,language).map(item=>item.text))].filter(Boolean).join('\n');
}
const withoutUrls=(text:string)=>text.replace(/https?:\/\/[^\s<>"“”]+/giu,'');
/** Parse quantity compounds as quantities, preserving unrelated names such as Three-Body. */
function copyNumericalFacts(text:string):NumericalFacts {
 const magnitude='hundred|thousand|million|billion|trillion',hyphen='[-\u2010-\u2015\u2212]';
 const cardinal='zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
 const normalized=withoutUrls(text).normalize('NFKC')
  .replace(new RegExp(`\\b(\\d[\\d,.]*|${cardinal}|${magnitude})${hyphen}(?=(?:${magnitude})\\b)`,'gi'),'$1 ')
  .replace(new RegExp(`\\b(${magnitude})${hyphen}(?=[a-z])`,'gi'),'$1 ');
 return numericalFacts(normalized);
}
export function topicShareNumericalEvidence(source:TopicShareSource):NumericalFacts {
 try{return copyNumericalFacts(sourceFacts(source));}
 catch{return {numbers:[],ratios:[],seasons:[],dates:[],roles:{}};}
}
function unsupportedCommentClaim(body:string):boolean {
 const audience='(?:commenters?|viewers?|users?|fans?|readers?|netizens?)';
 const predicates='(?:say|said|think|thought|believe|believed|support|supported|oppose|opposed|envy|envied|praise|praised|mock|mocked|criticize|criticized|envious|amused|excited|angry|worried)';
 const audienceClaim=`${audience}\\s+(?:(?:are|were|have|had|seem|seemed|appear|appeared|feel|felt|[a-z]+ly)\\s+){0,3}${predicates}\\b`;
 const comment='(?:(?:any|saved|usable|verifiable|viewer|audience|user|reader|sampled|actual)\\s+)*comments?(?:\\s+(?:samples?|data|evidence))?\\b';
 const remaining=body.normalize('NFKC').replaceAll('’',"'")
  .replace(new RegExp(`\\b(?:does not|do not|did not|doesn't|don't|didn't)\\s+(?:include|contain|provide|have|save|capture|record)\\s+${comment}`,'gi'),'')
  .replace(new RegExp(`\\b(?:has|have|had|contains?|includes?|provides?|offers?|captures?|records?)\\s+no\\s+${comment}`,'gi'),'')
  .replace(new RegExp(`\\b(?:lacks?|without)\\s+${comment}`,'gi'),'')
  .replace(new RegExp(`\\b${comment}\\s+(?:is|are|was|were|has been|have been)\\s+(?:not|never)\\s+(?:available|provided|included|saved|captured|recorded)\\b`,'gi'),'')
  .replace(new RegExp(`\\b${comment}\\s+(?:is|are|was|were)\\s+(?:unavailable|absent|missing)\\b`,'gi'),'')
  .replace(new RegExp(`\\bno\\s+${comment}\\s+(?:(?:is|are|was|were|has been|have been)\\s+)?(?:available|provided|included|saved|captured|recorded)\\b`,'gi'),'')
  .replace(/\bno\s+(?:saved\s+)?evidence\s+(?:of|about)\s+(?:what|how)\s+(?:(?:the|saved)\s+)?commenters?\s+(?:think|thought|say|said|feel|felt|reacted)\b/gi,'');
 const withoutNegativeLists=remaining.replace(/\bcomments?\b/gi,(word:string,offset:number,full:string)=>{
  const prefix=full.slice(0,offset).split(/[.!?;\n]/u).at(-1)??'';
  const negative=[...prefix.matchAll(/\b(?:does not|do not|did not|doesn't|don't|didn't)\s+(?:include|contain|provide|have)\b/gi)].at(-1);
  if(!negative)return word;
  const scope=prefix.slice(negative.index!+negative[0].length),after=full.slice(offset+word.length);
  const modifier=after.match(/^\s+(?:about|on|from)\s+([a-z][a-z' -]{0,140}?)(?=\s*(?:$|[.!?;\n]|(?:,\s*)?(?:or|and)\b))/i);
  const nounModifier=modifier&&!/\b(?:say|said|show|shows|reveal|reveals|suggest|suggests|indicate|indicates|prove|proves|express|expresses|support|supports|oppose|opposes|claim|claims|argue|argues|confirm|confirms|are|is|were|have|has|will|would|can|may)\b/i.test(modifier[1]);
  const tail=nounModifier?after.slice(modifier![0].length):after;
  // Only a noun-list tail may inherit the earlier negation; a new predicate may not.
  if(/\b(?:but|however|yet|nevertheless|instead)\b/i.test(scope)||!/^\s*(?:$|[.!?;\n]|(?:,\s*)?(?:or|and)\b)/i.test(tail))return word;
  return '';
 });
 const withoutUncertainty=withoutNegativeLists
  .replace(new RegExp(`\\b(?:cannot|can't|does not|doesn't|do not|don't)\\s+(?:establish|verify|determine|show|confirm|tell)\\s+(?:what|how|whether|if)\\s+${audienceClaim}`,'gi'),'')
  .replace(new RegExp(`\\b(?:unclear|unknown|uncertain|unverified)\\s+(?:what|how|whether|if)\\s+${audienceClaim}`,'gi'),'')
  .replace(/(?:无法|不能|未能|尚未)(?:判断|确认|证明|核实)(?:网友|用户|观众|读者|粉丝)(?:是否|如何)?(?:支持|反对|认为|表示|说|感到)/gu,'');
 return new RegExp(`\\b${audienceClaim}`,'i').test(withoutUncertainty)||/\bcomment(?:er|ers|s)?\b|(?:网友|用户|观众|读者|粉丝)(?:们)?(?:纷纷|普遍|大多|对此|已经|都|仍然|也|对[^，。；！？\n]{1,20}){0,3}(?:表示|说|认为|称|感到|羡慕|调侃|支持|反对|担心|质疑|感叹|围观)|评论(?:说|表示|认为|指出)/iu.test(withoutUncertainty);
}

/** Structural/provenance failures are errors; editorial rules collect observations. */
function assessTopicShareCopy(value:unknown,source:TopicShareSource):{copy:TopicShareCopy;issues:TopicShareRepairIssue[]} {
 const data=object(value,'TopicShare');
 fields(data,['version','generatedAt','model','sourceFingerprint','column','en','zh','editorialPolicy'],'TopicShare');
 if(data.editorialPolicy!==undefined&&data.editorialPolicy!=='news-commentary-v1')throw new Error('Unknown editorial policy');
 if(data.version!==1)throw new Error('Unsupported topic share version');
 if(typeof data.sourceFingerprint!=='string'||data.sourceFingerprint!==source.fingerprint||!/^[a-f0-9]{64}$/.test(data.sourceFingerprint))throw new Error('Topic share source fingerprint changed');
 const generatedAt=text(data.generatedAt,'generatedAt',40),model=text(data.model,'model',200);
 if(!/^\d{4}-\d{2}-\d{2}T/.test(generatedAt)||!Number.isFinite(Date.parse(generatedAt)))throw new Error('Invalid generatedAt');
 if(!EDITORIAL_COLUMNS.some(column=>column.id===data.column))throw new Error('Unknown editorial column');
 const copyIssues:TopicShareCopyIssue[]=[];
 if(!eligibleColumns(source).includes(data.column as EditorialColumn))copyIssues.push({path:'column',code:'column_evidence',message:'Editorial column lacks matching source evidence'});
 const column=data.column as EditorialColumn,en=localized(data.en,'en',copyIssues,!!data.editorialPolicy),zh=localized(data.zh,'zh',copyIssues,!!data.editorialPolicy);
 const facts=sourceFacts(source);
 let allowedFacts:NumericalFacts;
 try{allowedFacts=copyNumericalFacts(facts);}
 catch{allowedFacts={numbers:[],ratios:[],seasons:[],dates:[],roles:{}};copyIssues.push({path:'source.numbers',code:'review_unavailable',message:'Source numerical analysis unavailable'});}
 const allowedLinks=new Set([...source.links.map(link=>link.url),...(source.research?.documents??[]).map(doc=>doc.url)]);
 const numericalIssues:TopicShareNumericIssue[]=[];
 const commentIssues:TopicShareCommentIssue[]=[];
 for(const language of ['en','zh'] as const){
  const localizedCopy=language==='en'?en:zh,quotes=usableTopicQuotes(source,language);
  for(const [index,post] of localizedCopy.posts.entries()){
   if(post.pattern==='source_voice'&&!quotes.length)copyIssues.push({path:`${language}.posts[${index}].pattern`,code:'pattern',message:'Source voice pattern requires saved comment evidence'});
   if(post.pattern==='number_context'&&!allowedFacts.numbers.length&&!allowedFacts.ratios.length)copyIssues.push({path:`${language}.posts[${index}].pattern`,code:'pattern',message:'Number pattern requires source numerical evidence'});
  }
  for(const {path,body} of visibleTexts(localizedCopy,language)){
   if(data.editorialPolicy&&/保存的(?:材料|报道|描述)|原材料(?:中|里)|本次(?:检索|查询)|(?:材料|原文)(?:中)?没有(?:说明|提供|提到)|登上.{0,12}热搜第|\b(?:saved (?:material|report|source)|the supplied material|source material does not|(?:our|this) (?:search|retrieval) (?:found|did not))\b/i.test(body))copyIssues.push({path,code:'editorial_style',message:'Public text contains internal evidence diagnostics or hot-list filler'});
   for(const match of body.matchAll(/https?:\/\/[^\s<>"“”]+/giu)){
    const url=match[0].replace(/[.,;!?，。；！？)）]+$/u,'');
    if(!allowedLinks.has(url))copyIssues.push({path,code:'link',message:'Unapproved source URL in generated copy'});
   }
   if(/(?:javascript|data|file):|(?:www\.)[^\s]+/i.test(body))copyIssues.push({path,code:'link',message:'Unapproved source link in generated copy'});
   try{const unsupported=unsupportedNumbers(allowedFacts,copyNumericalFacts(body));if(unsupported)numericalIssues.push({path,unsupported});}
   catch{copyIssues.push({path,code:'review_unavailable',message:'Numerical analysis unavailable'});}
   if(/\b(?:most|all|every|half of|a majority of)\s+(?:Chinese\s+)?(?:users?|buyers?|people|consumers?|netizens?|citizens?)\b|(?:所有|全部|大多数|多数|全民|全国人民|全中国)(?:的)?(?:用户|消费者|买家|网民|人|都)|全(?:中国|国)都/i.test(body))copyIssues.push({path,code:'population',message:'Unsupported representative population claim'});
   const quotations=[...body.matchAll(/“([^”]+)”|「([^」]+)」|『([^』]+)』|"([^"\n]+)"|(?:^|\s)'([^'\n]+)'/gu)].map(match=>match.slice(1).find(Boolean)!);
   if(quotations.some(quote=>column==='voices'||!facts.includes(quote)))copyIssues.push({path,code:'quotation',message:'Model quotations are not source-owned comment evidence'});
   if(!quotes.length&&unsupportedCommentClaim(body))commentIssues.push({path,reason:'missing_saved_comment_evidence'});
  }
 }
 if(usableTopicQuotes(source,'zh').length>usableTopicQuotes(source,'en').length)copyIssues.push({path:'source.commentTranslation',code:'comment_translation',message:'Some source comments lack a usable English translation'});
 if(usableTopicQuotes(source,'en').some(item=>/\p{Script=Han}/u.test(item.text)))copyIssues.push({path:'source.commentTranslation',code:'language',message:'Stored English comment translation contains Chinese; preserved for administrator review'});
 return {copy:{version:1,generatedAt,model,sourceFingerprint:data.sourceFingerprint,column,en,zh,...(data.editorialPolicy?{editorialPolicy:'news-commentary-v1' as const}:{})},issues:[...copyIssues,
  ...numericalIssues.map(issue=>({...issue,code:'numerical' as const})),...commentIssues.map(issue=>({...issue,code:'comment_evidence' as const}))]};
}

/** Production draft path: wording/translation doubts NEVER become generation/save errors. */
export function prepareTopicShareDraft(value:unknown,source:TopicShareSource):{copy:TopicShareCopy;reviewWarnings:TopicShareReviewWarning[]} {
 const {copy,issues}=assessTopicShareCopy(structuredClone(value),source);
 const warnings=issues.map(issue=>({path:issue.path,code:issue.code,message:TOPIC_REVIEW_MESSAGES[issue.code]??'请自行核对这部分内容。',...('unsupported' in issue?{values:[
  ...issue.unsupported.numbers.map(value=>value.replace(/\/1$/u,'')),...issue.unsupported.dates,...Object.entries(issue.unsupported.roles).flatMap(([role,values])=>values.map(value=>`${role}: ${value}`))
 ]}: {})}));
 return {copy,reviewWarnings:[...new Map(warnings.map(warning=>[`${warning.path}:${warning.code}`,warning])).values()]};
}

/** Public validation accepts editorial doubts; only structure and source integrity can throw. */
export function validateTopicShareCopy(value:unknown,source:TopicShareSource):TopicShareCopy {
 return prepareTopicShareDraft(value,source).copy;
}

/** Diagnostic assertion for classifier tests only. Never use as a generation/save gate. */
export function assertNoTopicShareReviewWarnings(value:unknown,source:TopicShareSource):TopicShareCopy {
 const {copy,issues}=assessTopicShareCopy(structuredClone(value),source);
 const copyIssues=issues.filter((issue):issue is TopicShareCopyIssue=>issue.code!=='numerical'&&issue.code!=='comment_evidence');
 const numericalIssues=issues.filter((issue):issue is TopicShareNumericIssue&{code:'numerical'}=>issue.code==='numerical');
 const commentIssues=issues.filter((issue):issue is TopicShareCommentIssue&{code:'comment_evidence'}=>issue.code==='comment_evidence');
 if(copyIssues.length)throw new TopicShareCopyError([...copyIssues,
  ...numericalIssues.map(issue=>({...issue,code:'numerical' as const})),
  ...commentIssues.map(issue=>({...issue,code:'comment_evidence' as const}))]);
 if(commentIssues.length)throw new TopicShareCommentError(commentIssues,numericalIssues);
 if(numericalIssues.length)throw new TopicShareNumericalError(numericalIssues);
 return copy;
}
