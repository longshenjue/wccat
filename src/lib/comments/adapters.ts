import type {CommentThread,SampledComment} from './types';

type Occurrence={sourceId:string;url:string};
const hosts:Record<string,string[]>={bilibili:['www.bilibili.com','m.bilibili.com','bilibili.com','b23.tv'],zhihu:['www.zhihu.com','zhihu.com'],weibo:['weibo.com','www.weibo.com','m.weibo.cn']};
export function resolveCommentThread(item:Occurrence):CommentThread|undefined {
  let url:URL;try{url=new URL(item.url);}catch{return;}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts[item.sourceId]?.includes(url.hostname))return;
  const make=(sourceId:CommentThread['sourceId'],id:string,articleUrl:string,extra:Partial<CommentThread>):CommentThread=>({sourceId,key:sourceId+':'+id,articleUrl,sourceName:{bilibili:'B站',zhihu:'知乎',weibo:'微博'}[sourceId],...extra});
  if(item.sourceId==='bilibili'){
    const id=url.hostname==='b23.tv'?url.pathname.match(/^\/(BV[a-zA-Z0-9]{10})\/?$/)?.[1]:url.pathname.match(/^\/video\/(av\d{1,18}|BV[a-zA-Z0-9]{10})\/?$/)?.[1];if(!id)return;
    return make('bilibili',id,'https://www.bilibili.com/video/'+id,id.startsWith('BV')?{bvid:id}:{apiUrl:biliComments(id.slice(2))});
  }
  if(item.sourceId==='zhihu'){
    const match=url.pathname.match(/^\/question\/(\d{1,24})(?:\/answer\/(\d{1,24}))?\/?$/);if(!match)return;
    const kind=match[2]?'answers':'questions',id=match[2]??match[1];
    return make('zhihu',kind+':'+id,'https://www.zhihu.com'+url.pathname.replace(/\/$/,''),{apiUrl:`https://www.zhihu.com/api/v4/comment_v5/${kind}/${id}/root_comment?order_by=score&limit=20&offset=`});
  }
  const id=url.hostname==='m.weibo.cn'?url.pathname.match(/^\/(?:detail|status)\/(\d{1,24})\/?$/)?.[1]:url.pathname.match(/^\/\d{1,24}\/(\d{1,24})\/?$/)?.[1];
  if(id)return make('weibo',id,'https://m.weibo.cn/detail/'+id,{apiUrl:`https://m.weibo.cn/comments/hotflow?id=${id}&mid=${id}&max_id_type=0`});
}
export function biliComments(aid:string){return `https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=1&pn=1&ps=20`;}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export class CommentResponseError extends Error {constructor(message:string,readonly status=0){super(message);}}
function plain(value:unknown){
  if(typeof value!=='string')return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<img\b[^>]*>/gi,tag=>tag.match(/\balt=["']([^"']*)["']/i)?.[1]??'').replace(/<br\s*\/?\s*>|<\/p>/gi,' ').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,v=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[v]??v)).replace(/&#(x[\da-f]+|\d+);/gi,(_,n:string)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/\s+/g,' ').trim();
}
export function normalizeComments(thread:CommentThread,value:unknown,observedAt:string):SampledComment[]{
  const root=object(value),data=object(root.data);
  if(thread.sourceId==='bilibili'&&root.code!==0)throw new CommentResponseError('Bilibili comment API refused',[-352,-403,-412].includes(Number(root.code))?403:0);
  if(thread.sourceId==='weibo'&&root.ok!==1)throw new CommentResponseError('Weibo comment API refused',403);
  if(thread.sourceId==='zhihu'&&root.error)throw new CommentResponseError('Zhihu comment API refused',403);
  const list=thread.sourceId==='bilibili'?data.replies:thread.sourceId==='weibo'?data.data:root.data;
  // Bilibili represents a genuinely empty/closed thread with null replies.
  if(list===null&&thread.sourceId==='bilibili')return [];
  if(!Array.isArray(list))throw new CommentResponseError('Comment list missing');
  const seen=new Set<string>(),result:SampledComment[]=[];
  for(const [index,entry] of list.slice(0,20).entries()){
    const item=object(entry),content=object(item.content);
    const rawId=thread.sourceId==='bilibili'?item.rpid_str??item.rpid:item.idstr??item.id;
    if(!['string','number'].includes(typeof rawId)||(typeof rawId==='number'&&!Number.isSafeInteger(rawId))||!/^\d{1,30}$/.test(String(rawId)))continue;
    const id=thread.sourceId+':'+rawId;
    const text=thread.sourceId==='bilibili'?(typeof content.message==='string'?content.message.trim():''):plain(thread.sourceId==='weibo'?item.text:item.content);
    if(seen.has(id)||text.length<6||text.length>600)continue;seen.add(id);
    const rawLikes=thread.sourceId==='bilibili'?item.like:item.like_count;
    const likes=typeof rawLikes==='number'&&Number.isSafeInteger(rawLikes)&&rawLikes>=0?rawLikes:undefined;
    // Use a stable thread URL: evidence sanitization intentionally removes fragments.
    result.push({id,text,sourceId:thread.sourceId,sourceName:thread.sourceName,articleUrl:thread.articleUrl,url:thread.articleUrl,likes,rank:index+1,observedAt});
  }
  return result;
}
