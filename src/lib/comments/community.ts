import type {CommentThread,SampledComment} from './types';

type CommunitySource='hupu'|'douban'|'tieba';
const sourceNames:Record<CommunitySource,string>={hupu:'虎扑',douban:'豆瓣',tieba:'百度贴吧'};
const hosts:Record<CommunitySource,string[]>={hupu:['bbs.hupu.com'],douban:['www.douban.com','m.douban.com'],tieba:['tieba.baidu.com']};
const numericId=/^[1-9]\d{0,23}$/;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const isSource=(source:string):source is CommunitySource=>Object.hasOwn(sourceNames,source);
function id(value:unknown):string|undefined {
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<=0))return;
 if(typeof value!=='number'&&typeof value!=='string')return;
 const result=String(value);return numericId.test(result)?result:undefined;
}
function likes(value:unknown):number|undefined {
 if(typeof value==='string'&&!/^\d{1,16}$/.test(value))return;
 if(typeof value!=='string'&&typeof value!=='number')return;
 const result=Number(value);return Number.isSafeInteger(result)&&result>=0?result:undefined;
}
function unavailable(value:unknown){return value===true||value===1||value==='1';}
/** The adapters entry point can translate this error without creating an import cycle. */
export class CommunityCommentResponseError extends Error {
 constructor(message:string,readonly status=0){super(message);this.name='CommunityCommentResponseError';}
}
function plain(value:unknown):string {
 if(typeof value!=='string')return '';
 const entities:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
 return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/<img\b[^>]*>/gi,tag=>tag.match(/\balt=["']([^"']*)["']/i)?.[1]??'')
  .replace(/<br\s*\/?\s*>|<\/p>/gi,' ')
  .replace(/<\/?[a-z][^>]*>/gi,'')
  .replace(/&([a-z]+|#(?:x[\da-f]+|\d+));/gi,(match,name:string)=>{
   if(name[0]!=='#')return entities[name.toLowerCase()]??match;
   const hex=name.slice(1,2).toLowerCase()==='x',number=parseInt(name.slice(hex?2:1),hex?16:10);
   return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'';
  }).replace(/\s+/g,' ').trim();
}
export function resolveCommunityThread(item:{sourceId:string;url:string}):CommentThread|undefined {
 if(!isSource(item.sourceId))return;
 let url:URL;try{url=new URL(item.url);}catch{return;}
 const source=item.sourceId;
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[source].includes(url.hostname))return;
 let threadId:string|undefined,articleUrl:string,apiUrl:string;
 if(source==='hupu'){
  threadId=url.pathname.match(/^\/([1-9]\d{0,23})\.html$/)?.[1];if(!threadId)return;
  articleUrl='https://bbs.hupu.com/'+threadId+'.html';apiUrl='https://bbs.hupu.com/api/v2/threads?tid='+threadId;
 }else if(source==='douban'){
  threadId=url.pathname.match(/^\/group\/topic\/([1-9]\d{0,23})\/?$/)?.[1];if(!threadId)return;
  articleUrl='https://www.douban.com/group/topic/'+threadId+'/';apiUrl='https://m.douban.com/rexxar/api/v2/group/topic/'+threadId+'/comments?start=0&count=20&sort=hot';
 }else{
  if(!/^\/hottopic\/browse\/hottopic\/?$/.test(url.pathname)||url.searchParams.getAll('topic_id').length!==1)return;
  threadId=id(url.searchParams.get('topic_id'));if(!threadId)return;
  articleUrl='https://tieba.baidu.com/hottopic/browse/hottopic?topic_id='+threadId;
  apiUrl='https://tieba.baidu.com/c/f/hottopic/topicDetail?topic_id='+threadId+'&pn=1&rn=15&is_new=1&is_share=1&client_version=12.82.1.0&_client_version=12.82.1.0&_client_type=2';
 }
 return {key:source+':'+threadId,sourceId:source,sourceName:sourceNames[source],threadId,articleUrl,apiUrl};
}
export function normalizeCommunityComments(thread:CommentThread,value:unknown,observedAt:string):SampledComment[]|undefined {
 if(!isSource(thread.sourceId))return;
 const source=thread.sourceId,root=object(value);let list:unknown[],tiebaTid:string|undefined;
 if(source==='hupu'){
  if(root.code!==200)throw new CommunityCommentResponseError('Hupu comment API refused',[401,403,412,429].includes(Number(root.code))?Number(root.code):0);
  const lights=object(root.data).lights;if(!Array.isArray(lights))throw new CommunityCommentResponseError('Hupu light comments missing');list=lights;
 }else if(source==='douban'){
  if(root.error||root.code&&root.code!==200)throw new CommunityCommentResponseError('Douban comment API refused',403);
  if(!Array.isArray(root.comments)||root.popular_comments!==undefined&&!Array.isArray(root.popular_comments))throw new CommunityCommentResponseError('Douban comment list missing');
  list=[...(Array.isArray(root.popular_comments)?root.popular_comments:[]),...root.comments];
 }else{
  if(root.error_code!==0&&root.error_code!=='0')throw new CommunityCommentResponseError('Tieba topic API refused',403);
  if(!Array.isArray(root.area_card_list))throw new CommunityCommentResponseError('Tieba topic cards missing');
  const areas=root.area_card_list.map(object),contentAreas=areas.filter(area=>Array.isArray(area.card_data));
  if(!contentAreas.length)throw new CommunityCommentResponseError('Tieba topic comments unresolved');
  list=[];
  outer:for(const area of contentAreas){
   for(const rawCard of (area.card_data as unknown[])){
    const parent=object(object(object(rawCard).data).thread_info),posts=parent.hot_post_list,parentTid=id(parent.tid);
    if(!parentTid||!Array.isArray(posts)||!posts.length||unavailable(parent.is_deleted))continue;
    const matching=posts.filter(post=>id(object(post).tid)===parentTid);
    if(!matching.length)continue;
    tiebaTid=parentTid;list=matching;break outer;
   }
  }
 }
 const result:SampledComment[]=[],seen=new Set<string>();
 for(const raw of list){
  const row=object(raw);
  if(['isAudit','isHidden','isDelete','isSelfDelete','hidePost','is_deleted','is_disabled','is_folded','is_censoring'].some(key=>unavailable(row[key])))continue;
  const commentId=id(source==='hupu'?row.pid:row.id);if(!commentId)continue;
  if(source==='hupu'&&!id(thread.threadId))throw new CommunityCommentResponseError('Hupu thread ID missing');
  const stableId=source==='hupu'?'hupu:'+thread.threadId+':'+commentId:source+':'+commentId;
  if(seen.has(stableId))continue;
  let text:string;
  if(source==='tieba'){
   if(!Array.isArray(row.content)||id(row.tid)!==tiebaTid)continue;
   text=plain(row.content.map(object).filter(part=>part.type===0||part.type===2).map(part=>typeof part.text==='string'?part.text:'').join(''));
  }else if(source==='douban'){
   text=typeof row.text==='string'?row.text.trim():'';
  }else{
   // Retain the whole author's statement or omit it; never remove a visible inline quotation.
   if(typeof row.content==='string'&&/<\/?blockquote\b/i.test(row.content))continue;
   text=plain(row.content);
  }
  if(text.length<2||text.length>600)continue;
  const count=source==='hupu'?likes(row.allLightCount)??likes(row.count):source==='douban'?likes(row.vote_count):likes(object(row.agree).agree_num);
  const articleUrl=source==='tieba'?'https://tieba.baidu.com/p/'+tiebaTid:thread.articleUrl;
  seen.add(stableId);result.push({id:stableId,text,sourceId:source,sourceName:sourceNames[source],articleUrl,url:articleUrl,likes:count,rank:result.length+1,observedAt});
  if(result.length===20)break;
 }
 return result;
}
