import {XMLParser} from 'fast-xml-parser';
import {createHash} from 'node:crypto';
import type {ResearchDocument,ResearchHit,ResearchImage} from './types';
import {safeResearchUrl} from './public-fetch';
import {scanResearchHtml} from './html';

const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=(text:string)=>text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,value:string)=>{if(value[0]!=='#')return entities[value.toLowerCase()]??'';const code=value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):parseInt(value.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';});
const plain=(text:string)=>decode(scanResearchHtml(text).text).replace(/\s+/g,' ').trim();
export function parseSearchFeed(xml:string):ResearchHit[]{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported search XML declarations');
 const parsed=new XMLParser({processEntities:false}).parse(xml),items=parsed.rss?.channel?.item??[];
 return (Array.isArray(items)?items:[items]).slice(0,20).flatMap(item=>{try{let target=new URL(decode(String(item.link)));if(/(?:^|\.)bing\.com$/i.test(target.hostname)&&target.pathname==='/news/apiclick.aspx')target=new URL(target.searchParams.get('url')??'');return [{url:safeResearchUrl(target.href).href,title:plain(String(item.title??'')),snippet:plain(decode(String(item.description??''))),...(typeof item.pubDate==='string'&&Number.isFinite(Date.parse(item.pubDate))?{publishedAt:new Date(item.pubDate).toISOString()}: {})}];}catch{return [];}});
}
export function parseEncyclopediaSearch(json:string):ResearchHit[]{
 const data=JSON.parse(json) as {query?:{search?:Array<{title:string;snippet?:string}>}};
 return (data.query?.search??[]).slice(0,4).map(hit=>({title:hit.title,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(hit.title.replaceAll(' ','_')),snippet:plain(hit.snippet??'')}));
}
export function researchRelevance(text:string,anchors:string[]):boolean {
 const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const normalized=normalize(text);return anchors.some(anchor=>normalized.includes(normalize(anchor)));
}
export function matchesEventMarket(headline:string,subject:string):boolean {
 const market=subject.match(/^(?:[AHB]股|港股|美股|台股)/i)?.[0];
 if(!market||headline.toLowerCase().includes(market.toLowerCase()))return true;
 return !/(?:[AHB]股|港股|美股|台股|美债|U\.?S\.? stocks|Wall Street|Nasdaq)/i.test(headline);
}
/** Require subject and development evidence; a generic word such as “stocks” is no match. */
export function eventSourceMatches(headline:string,body:string,subject:string,anchors:string[]=[],query=''):boolean {
 if(!matchesEventMarket(headline,subject))return false;
 const text=headline+' '+body,market=subject.match(/^(?:[AHB]股|港股|美股|台股)/i)?.[0];
 if(market){
  const aliases:Record<string,RegExp>={a股:/A[ -]?shares?|A股|China|Chinese|Shanghai|Shenzhen|ChiNext|科创|创业板|上证|沪指/i,美股:/美股|U\.?S\.? stocks|Wall Street|Nasdaq|S&P/i,港股:/港股|Hong Kong|Hang Seng|恒生/i};
  if(!(aliases[market.toLowerCase()]??new RegExp(market,'i')).test(text))return false;
  return /涨|上升|拉升|rall|surg|jump|gain|ris(?:e|ing)|soar/i.test(subject)?/涨|上升|拉升|rall|surg|jump|gain|ris(?:e|ing)|soar/i.test(text):true;
 }
 if(/\p{Script=Han}/u.test(text)&&eventRelevance(text,subject,[]))return true;
 const generic=/^(?:china|chinese|stocks?|market|government|news|official|update|latest|report|after|before|the|and|for|with|from|this|that|november|december|january|february|march|april|june|july|august|september|october)$/i;
 const terms=[...new Set((query.match(/[a-z][a-z-]{3,}/gi)??[]).filter(word=>!generic.test(word)))];
 const precise=anchors.filter(anchor=>!generic.test(anchor)&&anchor.length>=3);
 const phrase=precise.some(anchor=>anchor.trim().split(/\s+/).length>1&&researchRelevance(text,[anchor]));
 const matches=terms.filter(term=>researchRelevance(text,[term])).length;
 return phrase||(terms.length>0&&matches>=Math.min(2,terms.length))||precise.filter(anchor=>researchRelevance(text,[anchor])).length>=2;
}
/** Headlines routinely reorder a phrase; do not demand one contiguous hot-search string. */
export function eventRelevance(text:string,title:string,anchors:string[]):boolean {
 const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const body=normalize(text),subject=normalize(title);
 const market=title.match(/^(?:[AHB]股|港股|美股|台股)/i)?.[0];
 if(market&&!body.includes(normalize(market)))return false;
 if(researchRelevance(text,anchors))return true;
 const pairs=new Set((subject.match(/[\p{Script=Han}]+/gu)??[]).flatMap(word=>Array.from({length:Math.max(0,word.length-1)},(_,i)=>word.slice(i,i+2))));
 return [...pairs].filter(pair=>!['如何','看待','原因','网友','中国','今天'].includes(pair)&&body.includes(pair)).length>=2;
}
export function extractResearchDocument(url:string,html:string,retrievedAt:string,purpose:'event'|'background'='event',options:{editionDate?:string;feedPublishedAt?:string}={}):ResearchDocument {
 const target=safeResearchUrl(url),parsed=scanResearchHtml(html),title=decode(parsed.metadata['og:title']??parsed.title??target.hostname).trim()||target.hostname;
 if(/access denied|verify you are human|just a moment|安全验证|验证码|未知错误|attention required/i.test(title))throw new Error('Research verification page');
 const text=decode(parsed.text).replace(/\s+/g,' ').trim().slice(0,6000);
 if(text.length<200||!/[\p{L}\p{N}]/u.test(text)||/^(?:verify you are human|access denied|please enable javascript|请完成安全验证)/i.test(text))throw new Error('No usable research article body');
 const dates=[parsed.metadata['article:published_time'],parsed.metadata['weibo:article:create_at'],parsed.metadata.pubdate,target.pathname.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/)?.slice(1).join('-'),options.feedPublishedAt];
 const published=dates.find(value=>value&&Number.isFinite(Date.parse(value)));
 const edition=Date.parse((options.editionDate??retrievedAt.slice(0,10))+'T00:00:00+08:00'),publishedTime=published?Date.parse(published):NaN;
 const current=Number.isFinite(publishedTime)&&publishedTime>=edition-3*86400_000&&publishedTime<edition+26*3600_000&&publishedTime<=Date.parse(retrievedAt)+30*60_000;
 const historical=purpose==='background'||/wikipedia\.org$/.test(target.hostname)||!current;
 return {id:'r-'+createHash('sha256').update(target.href).digest('hex').slice(0,10),url:target.href,title,publisher:decode(parsed.metadata['og:site_name']??target.hostname.replace(/^www\./,'')),text,retrievedAt,purpose:historical?'background':'event',...(published?{publishedAt:published}: {})};
}
export function researchImages(html:string,pageUrl:string,publisher:string):ResearchImage[]{
 const meta=scanResearchHtml(html).metadata;
 return [...new Set([meta['og:image'],meta['og:image:url'],meta['twitter:image']].filter(Boolean))].flatMap(raw=>{try{const url=safeResearchUrl(new URL(decode(raw),pageUrl).href);if(/logo|avatar|favicon|icon|qrcode/i.test(url.pathname))return [];return [{url:url.href,pageUrl,publisher}];}catch{return [];}}).slice(0,2);
}
export function primarySourceLinks(html:string,base:string,anchors:string[]=[]):string[]{
 const found=new Set<string>();
 for(const href of scanResearchHtml(html).links){
  try{const url=safeResearchUrl(new URL(decode(href),base).href);if(/\.(?:gov|mil|int)$/i.test(url.hostname)&&/article|news|press|release|update|environment|report|fact-sheet/i.test(url.pathname)&&!/privacy|accessibility|contact|polic(?:y|ies)/i.test(url.pathname)&&url.href!==base)found.add(url.href);}catch{continue;}
 }
 const relevant=(url:string)=>{try{return researchRelevance(decodeURIComponent(new URL(url).pathname).replaceAll('_',' ').replaceAll('-',' '),anchors);}catch{return false;}};
 return [...found].sort((a,b)=>Number(relevant(b))-Number(relevant(a))).slice(0,2);
}
