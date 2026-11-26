import type {CommentExamples,CommentQuote,CommentSample,CommentSide} from './types';
import {commentArticleUrl} from './adapters';
type Labels={redLabel:string;blueLabel:string};
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** All quotation identity, text and provenance are owned by the collected source. */
export function selectCommentExamples(sample:CommentSample,battle:Labels,value:unknown):CommentExamples|undefined {
 const rows=record(value).classifications;if(!Array.isArray(rows))return;
 const source=new Map(sample.comments.slice(0,40).map(c=>[c.id,c])),seen=new Set<string>(),duplicates=new Set<string>();
 for(const row of rows.slice(0,80)){const id=record(row).id;if(typeof id==='string'){if(seen.has(id))duplicates.add(id);seen.add(id);}}
 const sides:{red:CommentQuote[];blue:CommentQuote[]}={red:[],blue:[]};
 for(const row of rows.slice(0,80)){
  const r=record(row);if(typeof r.id!=='string'||duplicates.has(r.id)||!source.has(r.id)||!['red','blue'].includes(String(r.side))||typeof r.confidence!=='number'||!Number.isFinite(r.confidence)||r.confidence<.8||r.confidence>1)continue;
  const english=typeof r.englishText==='string'?r.englishText.trim():'';
  const englishText=english&&/[a-z]/i.test(english)&&!/\p{Script=Han}/u.test(english)&&english.length<=1000&&english.split(/\s+/).length<=80?english:undefined;
  sides[r.side as CommentSide].push({...source.get(r.id)!,...(englishText?{englishText,englishIsExcerpt:Array.from(source.get(r.id)!.text).length>96}:{})});
 }
 const highest=(list:CommentQuote[])=>list.sort((a,b)=>(b.likes??-1)-(a.likes??-1)||a.rank-b.rank||a.id.localeCompare(b.id))[0];
 const red=highest(sides.red),blue=highest(sides.blue);if(!red&&!blue)return;
 return {...battle,...(red?{red}:{}),...(blue?{blue}:{}),sampleCount:source.size,sampledAt:sample.comments.map(c=>c.observedAt).sort().at(-1)!,runIds:[...sample.runIds]};
}
export function visibleCommentQuotes(examples:CommentExamples|undefined,battle:Labels|undefined,language:'zh'|'en',options:{allowMixedEnglish?:boolean}={}){
 if(!examples||!battle||examples.redLabel!==battle.redLabel||examples.blueLabel!==battle.blueLabel||!Number.isFinite(examples.sampleCount)||examples.sampleCount<1)return [];
 const result:Array<{side:CommentSide;quote:CommentQuote;text:string}>=[];
 for(const side of ['red','blue'] as const){
  const quote=examples[side];if(!quote||typeof quote.text!=='string'||!quote.text.trim()||typeof quote.observedAt!=='string'||!Number.isFinite(Date.parse(quote.observedAt)))continue;
  const source=commentArticleUrl({sourceId:quote.sourceId,url:quote.articleUrl});if(!source)continue;
  try{const target=new URL(quote.url),article=new URL(source);if(target.protocol!=='https:'||target.username||target.password||target.origin!==article.origin||target.pathname!==article.pathname||target.search)continue;}catch{continue;}
  if(examples.red?.id&&examples.red.id===examples.blue?.id)continue;
  const text=language==='en'?quote.englishText:quote.text;
  if(typeof text!=='string'||!text.trim()||(language==='en'&&!options.allowMixedEnglish&&/\p{Script=Han}/u.test(text)))continue;
  result.push({side,quote,text});
 }
 return result;
}
export function excerptComment(text:string,language:'zh'|'en'){
 if(language==='en'){
  const words=text.trim().split(/\s+/),limited=words.slice(0,32).join(' '),chars=Array.from(limited);
  const excerpt=words.length>32||chars.length>220;
  return {text:excerpt?chars.slice(0,220).join('')+'…':text,excerpt};
 }
 const chars=Array.from(text);return {text:chars.length>96?chars.slice(0,96).join('')+'…':text,excerpt:chars.length>96};
}
