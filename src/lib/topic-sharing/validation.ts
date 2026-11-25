import {numericalFacts,type NumericalFacts} from '../translation-facts';
import {eligibleColumns,usableTopicQuotes} from './recommendation';
import type {EditorialColumn,LocalizedTopicShare,TopicShareCopy,TopicShareLanguage,TopicShareSource} from './types';

export const TOPIC_SHARE_POST_PATTERNS=['specific_observation','source_voice','number_context','bounded_counterpoint','culture_translation','sourced_update','context','uncertainty'] as const;

function object(value:unknown,path:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Missing object: ${path}`);
 return value as Record<string,unknown>;
}
function fields(value:Record<string,unknown>,allowed:readonly string[],path:string){
 for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`Unexpected source-owned or unknown field: ${path}.${key}`);
}
const chars=(text:string)=>Array.from(text).length;
const words=(text:string)=>text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length??0;
function text(value:unknown,path:string,max:number,language?:TopicShareLanguage,maxWords?:number):string {
 if(typeof value!=='string'||!value.trim())throw new Error(`Missing text: ${path}`);
 const clean=value.trim();
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(clean))throw new Error(`Unsafe control character: ${path}`);
 if(chars(clean)>max||(maxWords!==undefined&&words(clean)>maxWords))throw new Error(`Text length exceeds limit${maxWords!==undefined?' in words':''}: ${path}`);
 if(language==='en'&&(/\p{Script=Han}/u.test(clean)||!/[a-z]/i.test(clean)))throw new Error(`Incomplete English or Han text: ${path}`);
 if(language==='zh'&&!/\p{Script=Han}/u.test(clean))throw new Error(`Missing independently localized Chinese: ${path}`);
 return clean;
}
function localized(value:unknown,language:TopicShareLanguage):LocalizedTopicShare {
 const data=object(value,language),en=language==='en';
 fields(data,['headline','hook','summary','context','whyItMatters','question','posts','selectedPostId','replies','altText'],language);
 if(!Array.isArray(data.posts)||data.posts.length!==3)throw new Error(`Exactly three post candidates required: ${language}.posts`);
 const ids=new Set<string>(),bodies=new Set<string>(),patterns=new Set<string>();
 const posts=data.posts.map((value,index)=>{
  const path=`${language}.posts[${index}]`,post=object(value,path);
  fields(post,['id','pattern','text','reason'],path);
  const id=text(post.id,path+'.id',80),pattern=text(post.pattern,path+'.pattern',80),body=text(post.text,path+'.text',en?280:140,language);
  if(!/^[a-zA-Z0-9_-]+$/.test(id)||!(TOPIC_SHARE_POST_PATTERNS as readonly string[]).includes(pattern))throw new Error(`Invalid post candidate id or pattern: ${path}`);
  const normalized=body.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLocaleLowerCase();
  if(ids.has(id)||bodies.has(normalized)||patterns.has(pattern))throw new Error(`Duplicate post candidate id, text or pattern: ${path}`);
  ids.add(id);bodies.add(normalized);patterns.add(pattern);
  return {id,pattern,text:body,reason:text(post.reason,path+'.reason',400)};
 });
 const selectedPostId=text(data.selectedPostId,language+'.selectedPostId',80);
 if(!ids.has(selectedPostId))throw new Error(`Unknown selected post candidate: ${language}.selectedPostId`);
 if(!Array.isArray(data.replies)||data.replies.length>4)throw new Error(`Reply count exceeds limit: ${language}.replies`);
 return {
  headline:text(data.headline,language+'.headline',en?200:45,language,en?18:undefined),
  hook:text(data.hook,language+'.hook',en?280:140,language),
  summary:text(data.summary,language+'.summary',en?1200:200,language,en?70:undefined),
  context:text(data.context,language+'.context',en?1200:220,language,en?70:undefined),
  whyItMatters:text(data.whyItMatters,language+'.whyItMatters',en?800:150,language,en?45:undefined),
  question:text(data.question,language+'.question',en?280:140,language),
  posts,selectedPostId,replies:data.replies.map((reply,index)=>text(reply,`${language}.replies[${index}]`,1000,language)),
  altText:text(data.altText,language+'.altText',1000,language)
 };
}
function visibleTexts(copy:LocalizedTopicShare,language:TopicShareLanguage):Array<{path:string;body:string}>{
 return [...(['headline','hook','summary','context','whyItMatters','question','altText'] as const).map(field=>({path:`${language}.${field}`,body:copy[field]})),...copy.posts.map((post,index)=>({path:`${language}.posts[${index}].text`,body:post.text})),...copy.replies.map((body,index)=>({path:`${language}.replies[${index}]`,body}))];
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
function unsupportedNumbers(source:NumericalFacts,target:NumericalFacts):NumericalFacts|undefined {
 const roles=Object.fromEntries(Object.entries(target.roles).map(([role,values])=>[role,missingFacts(source.roles[role]??[],values)]).filter(([,values])=>values.length));
 const result={numbers:missingFacts(source.numbers,target.numbers),ratios:missingFacts(source.ratios,target.ratios,value=>JSON.stringify(value)),seasons:missingFacts(source.seasons,target.seasons),dates:missingFacts(source.dates,target.dates),roles};
 return result.numbers.length||result.ratios.length||result.seasons.length||result.dates.length||Object.keys(roles).length?result:undefined;
}
function sourceFacts(source:TopicShareSource):string {
 return [source.title,source.summary,source.detail,source.context,source.analysis?.summary,source.analysis?.detailedContent,source.analysis?.outsiderContext,...source.links.map(link=>link.title),...(['en','zh'] as const).flatMap(language=>usableTopicQuotes(source,language).map(item=>item.text))].filter(Boolean).join('\n');
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

/** Strict, browser-safe validation; original URLs, quotations and metrics never become model fields. */
export function validateTopicShareCopy(value:unknown,source:TopicShareSource):TopicShareCopy {
 const data=object(value,'TopicShare');
 fields(data,['version','generatedAt','model','sourceFingerprint','column','en','zh'],'TopicShare');
 if(data.version!==1)throw new Error('Unsupported topic share version');
 if(typeof data.sourceFingerprint!=='string'||data.sourceFingerprint!==source.fingerprint||!/^[a-f0-9]{64}$/.test(data.sourceFingerprint))throw new Error('Topic share source fingerprint changed');
 const generatedAt=text(data.generatedAt,'generatedAt',40),model=text(data.model,'model',200);
 if(!/^\d{4}-\d{2}-\d{2}T/.test(generatedAt)||!Number.isFinite(Date.parse(generatedAt)))throw new Error('Invalid generatedAt');
 if(!eligibleColumns(source).includes(data.column as EditorialColumn))throw new Error('Editorial column unavailable for this source and comment evidence');
 const column=data.column as EditorialColumn,en=localized(data.en,'en'),zh=localized(data.zh,'zh');
 const facts=sourceFacts(source),allowedFacts=copyNumericalFacts(facts);
 const allowedLinks=new Set(source.links.map(link=>link.url));
 const numericalIssues:TopicShareNumericIssue[]=[];
 const commentIssues:TopicShareCommentIssue[]=[];
 for(const language of ['en','zh'] as const){
  const localizedCopy=language==='en'?en:zh,quotes=usableTopicQuotes(source,language);
  for(const post of localizedCopy.posts){
   if(post.pattern==='source_voice'&&!quotes.length)throw new Error('Source voice pattern requires saved comment evidence');
   if(post.pattern==='number_context'&&!allowedFacts.numbers.length&&!allowedFacts.ratios.length)throw new Error('Number pattern requires source numerical evidence');
  }
  for(const {path,body} of visibleTexts(localizedCopy,language)){
   for(const match of body.matchAll(/https?:\/\/[^\s<>"“”]+/giu)){
    const url=match[0].replace(/[.,;!?，。；！？)）]+$/u,'');
    if(!allowedLinks.has(url))throw new Error('Unapproved source URL in generated copy');
   }
   if(/(?:javascript|data|file):|(?:www\.)[^\s]+/i.test(body))throw new Error('Unapproved source link in generated copy');
   const unsupported=unsupportedNumbers(allowedFacts,copyNumericalFacts(body));
   if(unsupported)numericalIssues.push({path,unsupported});
   if(/\b(?:most|all|every|half of|a majority of)\s+(?:Chinese\s+)?(?:users?|buyers?|people|consumers?|netizens?|citizens?)\b|(?:所有|全部|大多数|多数|全民|全国人民|全中国)(?:的)?(?:用户|消费者|买家|网民|人|都)|全(?:中国|国)都/i.test(body))throw new Error('Unsupported representative population claim');
   const quotations=[...body.matchAll(/“([^”]+)”|「([^」]+)」|『([^』]+)』|"([^"\n]+)"|(?:^|\s)'([^'\n]+)'/gu)].map(match=>match.slice(1).find(Boolean)!);
   if(quotations.some(quote=>column==='voices'||!facts.includes(quote)))throw new Error('Model quotations are not source-owned comment evidence');
   if(!quotes.length&&unsupportedCommentClaim(body))commentIssues.push({path,reason:'missing_saved_comment_evidence'});
  }
 }
 if(commentIssues.length)throw new TopicShareCommentError(commentIssues,numericalIssues);
 if(numericalIssues.length)throw new TopicShareNumericalError(numericalIssues);
 return {version:1,generatedAt,model,sourceFingerprint:data.sourceFingerprint,column,en,zh};
}
