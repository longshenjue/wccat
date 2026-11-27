import type {CommentThread,SampledComment} from './types';

type NewsSource='thepaper'|'qq-news'|'sina-news'|'netease-news';
type NewsRequest={url:string;method?:'POST';body?:string;contentType?:string};
const sourceNames:Record<NewsSource,string>={thepaper:'澎湃新闻','qq-news':'腾讯新闻','sina-news':'新浪新闻','netease-news':'网易新闻'};
const hosts:Record<NewsSource,string[]>={
 thepaper:['www.thepaper.cn','m.thepaper.cn','thepaper.cn'],
 'qq-news':['new.qq.com','news.qq.com','view.inews.qq.com'],
 'sina-news':['news.sina.com.cn','finance.sina.com.cn','sports.sina.com.cn','ent.sina.com.cn','tech.sina.com.cn','mil.news.sina.com.cn'],
 'netease-news':['www.163.com','m.163.com'],
};
const newsSource=(source:string):source is NewsSource=>Object.hasOwn(sourceNames,source);
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export class NewsCommentResponseError extends Error {constructor(message:string,readonly status=0){super(message);}}
function apiUrl(base:string,params:Record<string,string>){const url=new URL(base);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);return url.toString();}
function qqApi(id:string){return apiUrl('https://r.inews.qq.com/getQQNewsComment',{apptype:'web',article_id:id,reqNum:'10',transparam:'{}'});}
export function resolveNewsThread(item:{sourceId:string;url:string}):CommentThread|undefined {
 if(!newsSource(item.sourceId))return;
 let url:URL;try{url=new URL(item.url);}catch{return;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[item.sourceId].includes(url.hostname))return;
 const sourceId=item.sourceId;
 let id:string|undefined,articleUrl:string|undefined;
 if(sourceId==='thepaper'){
  id=url.pathname.match(/^\/newsDetail_forward_([1-9]\d{0,17})$/)?.[1];
  if(id)articleUrl='https://www.thepaper.cn/newsDetail_forward_'+id;
 }else if(sourceId==='qq-news'){
  id=url.pathname.match(url.hostname==='view.inews.qq.com'?/^\/k\/(\d{8}[A-Z0-9]{8})\/?$/:/^\/rain\/a\/(\d{8}[A-Z0-9]{8})\/?$/)?.[1];
  if(id)articleUrl='https://new.qq.com/rain/a/'+id;
 }else if(sourceId==='netease-news'){
  id=url.pathname.match(/^\/dy\/article\/([A-Z0-9]{16})\.html$/)?.[1];
  if(id)articleUrl='https://www.163.com/dy/article/'+id+'.html';
 }else{
  id=url.pathname.match(/^(?:\/[a-zA-Z0-9_-]+){1,5}\/\d{4}-\d{2}-\d{2}\/doc-([a-z]{6,16}\d{5,12})\.shtml$/)?.[1];
  if(id)articleUrl=url.origin+url.pathname;
 }
 if(!id||!articleUrl)return;
 return {sourceId,sourceName:sourceNames[sourceId],key:sourceId+':'+id,threadId:id,articleUrl,...(sourceId==='qq-news'?{apiUrl:qqApi(id)}:{})};
}
export async function resolveNewsRequest(thread:CommentThread,readText:(url:string)=>Promise<string>):Promise<NewsRequest|undefined> {
 if(!newsSource(thread.sourceId))return;
 // Revalidate canonical content before metadata discovery; metadata never supplies a request URL.
 const resolved=resolveNewsThread({sourceId:thread.sourceId,url:thread.articleUrl});
 if(!resolved||resolved.threadId!==thread.threadId)throw new NewsCommentResponseError('News article identifier missing');
 const id=resolved.threadId!;
 if(thread.sourceId==='thepaper')return {url:'https://api.thepaper.cn/comment/news/comment/talkList',method:'POST',contentType:'application/json',body:JSON.stringify({contId:id,contType:0,pageNum:1,pageSize:10})};
 if(thread.sourceId==='qq-news')return {url:qqApi(id)};
 const html=(await readText(resolved.articleUrl)).slice(0,524288);
 if(thread.sourceId==='netease-news'){
  const config=html.match(/["']productKey["']\s*:\s*["']([a-f0-9]{32})["'][\s\S]{0,300}?["']docId["']\s*:\s*["']([A-Z0-9]{16})["']/);
  if(!config||config[2]!==id)throw new NewsCommentResponseError('NetEase article comment metadata missing');
  return {url:apiUrl(`https://comment.api.163.com/api/v1/products/${config[1]}/threads/${id}/comments/hotList`,{offset:'0',limit:'10',showLevelThreshold:'72',headLimit:'1',tailLimit:'0'})};
 }
 const meta=html.match(/\bcontent\s*=\s*["']comment_channel:([a-z]{1,12});comment_id:([a-z0-9-]{1,80})["']/);
 const page=html.match(/\bchannel\s*:\s*["']([a-z]{1,12})["']\s*,\s*newsid\s*:\s*["']([a-z0-9-]{1,80})["']/);
 const channel=meta?.[1]??page?.[1],newsid=meta?.[2]??page?.[2];
 if(!channel||!newsid||(channel==='live'?!/^finance-\d{1,6}-\d{1,18}$/.test(newsid):newsid!=='comos-'+id.replace(/^i/,'') ))throw new NewsCommentResponseError('Sina article comment metadata missing');
 return {url:apiUrl('https://comment5.news.sina.com.cn/page/info',{format:'json',channel,newsid,group:'0',compress:'0',ie:'utf-8',oe:'utf-8',page:'1',page_size:'20'})};
}
function safeId(value:unknown,source:NewsSource):string|undefined {
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)return;value=String(value);}
 if(typeof value!=='string')return;
 return (source==='sina-news'?/^[a-zA-Z0-9-]{1,90}$/:/^\d{1,30}$/).test(value)?value:undefined;
}
function likes(value:unknown):number|undefined {
 if(typeof value==='string'){if(!/^(?:0|[1-9]\d*)$/.test(value))return;value=Number(value);}
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;
}
export function normalizeNewsComments(thread:CommentThread,value:unknown,observedAt:string):SampledComment[]|undefined {
 const source=thread.sourceId;if(!newsSource(source))return;
 const root=object(value),data=object(root.data),result=object(root.result);
 let list:unknown[];
 if(source==='thepaper'){
  if(root.code!==200)throw new NewsCommentResponseError('Paper comment API refused',Number(root.code)===403?403:0);
  if(!Array.isArray(data.list))throw new NewsCommentResponseError('Paper comment list missing');list=data.list;
 }else if(source==='qq-news'){
  if(root.ret!==0)throw new NewsCommentResponseError('QQ comment API refused',403);
  const rows=object(root.comments).new;if(!Array.isArray(rows))throw new NewsCommentResponseError('QQ comment list missing');list=rows.flatMap(row=>{
   if(!Array.isArray(row))return [row];
   if(row.length<=1)return row;
   // A root's parentid points to itself in the verified payload. Ambiguous chains are skipped.
   return row.filter(entry=>{const item=object(entry),id=safeId(item.reply_id,source);return id&&safeId(item.parentid,source)===id;});
  });
 }else if(source==='sina-news'){
  if(object(result.status).code!==0)throw new NewsCommentResponseError('Sina comment API refused',403);
  if(!Array.isArray(result.hot_list)||!Array.isArray(result.cmntlist))throw new NewsCommentResponseError('Sina comment list missing');list=[...result.hot_list,...result.cmntlist];
 }else{
  if(!Array.isArray(root.commentIds)||!root.comments||typeof root.comments!=='object'||Array.isArray(root.comments))throw new NewsCommentResponseError('NetEase comment list missing');
  const comments=object(root.comments);list=root.commentIds.slice(0,20).filter((id):id is string=>typeof id==='string'&&/^\d{1,30}$/.test(id)).flatMap(id=>{const item=object(comments[id]);return safeId(item.commentId,source)===id?[item]:[];});
 }
 const seen=new Set<string>(),out:SampledComment[]=[];
 for(const entry of list.slice(0,20)){
  const item=object(entry),id=safeId(source==='thepaper'||source==='netease-news'?item.commentId:source==='qq-news'?item.reply_id:item.mid,source);
  const rawText=source==='qq-news'?item.reply_content:item.content,text=typeof rawText==='string'?rawText.trim():'';
  if(!id||seen.has(id)||text.length<2||text.length>600)continue;
  if(source==='qq-news'&&Object.hasOwn(item,'parentid')&&safeId(item.parentid,source)!==id)continue;
  seen.add(id);out.push({id:source+':'+id,text,sourceId:source,sourceName:thread.sourceName,articleUrl:thread.articleUrl,url:thread.articleUrl,likes:likes(source==='thepaper'?item.praiseTimes:source==='qq-news'?item.agree_count:source==='sina-news'?item.agree:item.vote),rank:out.length+1,observedAt});
 }
 return out;
}
