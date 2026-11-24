import type {CommentThread,SampledComment,CommentRequest} from './types';

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const numericId=/^[1-9]\d{0,29}$/;
export class ToutiaoCommentResponseError extends Error {
 constructor(message:string,readonly status=0){super(message);this.name='ToutiaoCommentResponseError';}
}
function parseContentUrl(value:string):{kind:'trending'|'w'|'article';id:string;articleUrl:string}|undefined {
 let url:URL;try{url=new URL(value);}catch{return;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!['www.toutiao.com','m.toutiao.com'].includes(url.hostname))return;
 const match=url.pathname.match(/^\/(trending|w|article)\/([1-9]\d{0,23})\/?$/);if(!match)return;
 const kind=match[1] as 'trending'|'w'|'article',id=match[2];
 return {kind,id,articleUrl:`https://${kind==='trending'?'www':'m'}.toutiao.com/${kind}/${id}/`};
}
function commentRequest(id:string,articleUrl:string):CommentRequest {
 const url=new URL('https://www.toutiao.com/article/v2/tab_comments/');
 for(const [key,value] of Object.entries({aid:'24',app_name:'toutiao_web',group_id:id,item_id:id,offset:'0',count:'20'}))url.searchParams.set(key,value);
 return {url:url.toString(),articleUrl};
}
export function resolveToutiaoThread(item:{sourceId:string;url:string}):CommentThread|undefined {
 if(item.sourceId!=='toutiao')return;
 const content=parseContentUrl(item.url);if(!content)return;
 return {sourceId:'toutiao',sourceName:'今日头条',key:`toutiao:${content.kind}:${content.id}`,threadId:content.id,articleUrl:content.articleUrl,...(content.kind==='trending'?{}:{apiUrl:commentRequest(content.id,content.articleUrl).url})};
}
export async function resolveToutiaoRequest(thread:CommentThread,readText:(url:string,firstFeedItem?:boolean)=>Promise<string>):Promise<CommentRequest|undefined> {
 if(thread.sourceId!=='toutiao')return;
 const content=parseContentUrl(thread.articleUrl);
 if(!content||content.id!==thread.threadId)throw new ToutiaoCommentResponseError('Toutiao content identifier missing');
 if(content.kind!=='trending')return commentRequest(content.id,content.articleUrl);
 const feed=new URL('https://api.toutiaoapi.com/api/feed/topic_innerflow/v1/');
 for(const [key,value] of Object.entries({query_id:content.id,offset:'-1',count:'1',aid:'13',category:'topic_innerflow',ttfrom:'amos_land_normal',stream_api_version:'88',client_extra_params:JSON.stringify({is_webview:'1',format:'jpeg'})}))feed.searchParams.set(key,value);
 let payload:Record<string,unknown>;
 try{payload=object(JSON.parse(await readText(feed.toString(),true)));}catch(error){if(error instanceof SyntaxError)throw new ToutiaoCommentResponseError('Toutiao first feed item is not valid JSON');throw error;}
 if(!Array.isArray(payload.data))throw new ToutiaoCommentResponseError('Toutiao first feed item missing');
 if(!payload.data.length)return;
 const first=object(payload.data[0]);if(typeof first.content!=='string')return;
 let post:Record<string,unknown>;try{post=object(JSON.parse(first.content));}catch{throw new ToutiaoCommentResponseError('Toutiao original post metadata is not valid JSON');}
 if(post.ban_comment===true||post.ban_comment===1||post.ban_comment==='1'||typeof post.share_url!=='string')return;
 const original=parseContentUrl(post.share_url);if(!original||original.kind==='trending')return;
 // The topic ID never substitutes for the original post ID; later feed items are never inspected.
 return commentRequest(original.id,original.articleUrl);
}
function validLikes(value:unknown):number|undefined {
 if(typeof value==='string'){if(!/^(?:0|[1-9]\d*)$/.test(value))return;value=Number(value);}
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;
}
export function normalizeToutiaoComments(thread:CommentThread,value:unknown,at:string):SampledComment[]|undefined {
 if(thread.sourceId!=='toutiao')return;
 const root=object(value);
 if(root.message!=='success'||(root.err_no!==undefined&&root.err_no!==0))throw new ToutiaoCommentResponseError('Toutiao comment API refused',Number(root.err_no)===403?403:0);
 if(!Array.isArray(root.data))throw new ToutiaoCommentResponseError('Toutiao comment list missing');
 const out:SampledComment[]=[],seen=new Set<string>();
 for(const entry of root.data.slice(0,20)){
  const comment=object(object(entry).comment),id=comment.id_str,text=typeof comment.text==='string'?comment.text.trim():'';
  if(typeof id!=='string'||!numericId.test(id)||seen.has(id)||text.length<2||text.length>600)continue;
  seen.add(id);out.push({id:'toutiao:'+id,text,sourceId:'toutiao',sourceName:thread.sourceName,articleUrl:thread.articleUrl,url:thread.articleUrl,likes:validLikes(comment.digg_count),rank:out.length+1,observedAt:at});
 }
 return out;
}
