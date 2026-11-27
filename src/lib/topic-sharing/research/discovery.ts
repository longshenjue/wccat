import {XMLParser} from 'fast-xml-parser';
import {createHash} from 'node:crypto';
import type {ResearchDocument,ResearchHit} from './types';
import {safeResearchUrl} from './public-fetch';
import {scanResearchHtml} from './html';

const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=(text:string)=>text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,value:string)=>{if(value[0]!=='#')return entities[value.toLowerCase()]??'';const code=value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):parseInt(value.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';});
const plain=(text:string)=>decode(scanResearchHtml(text).text).replace(/\s+/g,' ').trim();
export function parseSearchFeed(xml:string):ResearchHit[]{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported search XML declarations');
 const parsed=new XMLParser({processEntities:false}).parse(xml),items=parsed.rss?.channel?.item??[];
 return (Array.isArray(items)?items:[items]).slice(0,20).flatMap(item=>{try{let target=new URL(decode(String(item.link)));if(/(?:^|\.)bing\.com$/i.test(target.hostname)&&target.pathname==='/news/apiclick.aspx')target=new URL(target.searchParams.get('url')??'');return [{url:safeResearchUrl(target.href).href,title:plain(String(item.title??'')),snippet:plain(String(item.description??''))}];}catch{return [];}});
}
export function parseEncyclopediaSearch(json:string):ResearchHit[]{
 const data=JSON.parse(json) as {query?:{search?:Array<{title:string;snippet?:string}>}};
 return (data.query?.search??[]).slice(0,4).map(hit=>({title:hit.title,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(hit.title.replaceAll(' ','_')),snippet:plain(hit.snippet??'')}));
}
export function researchRelevance(text:string,anchors:string[]):boolean {
 const normalized=text.normalize('NFKC').toLowerCase();return anchors.some(anchor=>normalized.includes(anchor.normalize('NFKC').toLowerCase()));
}
export function extractResearchDocument(url:string,html:string,retrievedAt:string,purpose:'event'|'background'='event'):ResearchDocument {
 const target=safeResearchUrl(url),parsed=scanResearchHtml(html),title=decode(parsed.metadata['og:title']??parsed.title??target.hostname).trim()||target.hostname;
 if(/access denied|verify you are human|just a moment|安全验证|验证码|未知错误|attention required/i.test(title))throw new Error('Research verification page');
 const text=decode(parsed.text).replace(/\s+/g,' ').trim().slice(0,6000);
 if(text.length<200||!/[\p{L}\p{N}]/u.test(text)||/^(?:verify you are human|access denied|please enable javascript|请完成安全验证)/i.test(text))throw new Error('No usable research article body');
 return {id:'r-'+createHash('sha256').update(target.href).digest('hex').slice(0,10),url:target.href,title,publisher:decode(parsed.metadata['og:site_name']??target.hostname.replace(/^www\./,'')),text,retrievedAt,purpose,...(parsed.metadata['article:published_time']?{publishedAt:parsed.metadata['article:published_time']}: {})};
}
export function primarySourceLinks(html:string,base:string,anchors:string[]=[]):string[]{
 const found=new Set<string>();
 for(const href of scanResearchHtml(html).links){
  try{const url=safeResearchUrl(new URL(decode(href),base).href);if(/\.(?:gov|mil|int)$/i.test(url.hostname)&&/article|news|press|release|update|environment|report|fact-sheet/i.test(url.pathname)&&!/privacy|accessibility|contact|polic(?:y|ies)/i.test(url.pathname)&&url.href!==base)found.add(url.href);}catch{continue;}
 }
 const relevant=(url:string)=>{try{return researchRelevance(decodeURIComponent(new URL(url).pathname).replaceAll('_',' ').replaceAll('-',' '),anchors);}catch{return false;}};
 return [...found].sort((a,b)=>Number(relevant(b))-Number(relevant(a))).slice(0,2);
}
