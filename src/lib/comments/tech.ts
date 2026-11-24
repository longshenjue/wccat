import type {CommentRequest,CommentThread,SampledComment} from './types';

const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const numericId=(value:unknown):string|undefined=>
  (typeof value==='string'||typeof value==='number'&&Number.isSafeInteger(value))&&/^[1-9]\d{0,29}$/.test(String(value))?String(value):undefined;

export function resolveTechThread(item:{sourceId:string;url:string}):CommentThread|undefined {
  if(item.sourceId!=='ithome'&&item.sourceId!=='huxiu')return;
  let url:URL;try{url=new URL(item.url);}catch{return;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return;
  if(item.sourceId==='ithome'&&['www.ithome.com','m.ithome.com','ithome.com'].includes(url.hostname)){
    const mobile=url.pathname.match(/^\/html\/([1-9]\d{4,11})\.htm$/);
    const desktop=url.pathname.match(/^\/0\/([1-9]\d{2,8})\/(\d{3})\.htm$/);
    const id=mobile?.[1]??(desktop?desktop[1]+desktop[2]:undefined);
    if(id)return {key:'ithome:'+id,sourceId:'ithome',sourceName:'IT之家',threadId:id,articleUrl:`https://m.ithome.com/html/${id}.htm`};
  }
  if(item.sourceId==='huxiu'&&['www.huxiu.com','m.huxiu.com','huxiu.com'].includes(url.hostname)){
    const id=url.pathname.match(/^\/moment\/([1-9]\d{0,17})\.html$/)?.[1];
    if(id)return {key:'huxiu:moment:'+id,sourceId:'huxiu',sourceName:'虎嗅',threadId:id,articleUrl:`https://www.huxiu.com/moment/${id}.html`};
  }
}

export function metadataURL(thread:CommentThread):string|undefined {
  if(thread.sourceId!=='ithome')return;
  if(!thread.threadId||!/^\d{5,12}$/.test(thread.threadId))throw new Error('IT之家 metadata ID missing');
  return `https://m.ithome.com/html/${thread.threadId}.htm`;
}

function momentRequest(thread:CommentThread,type:'1'|'2'):CommentRequest {
  if(!numericId(thread.threadId))throw new Error('Huxiu moment ID missing');
  return {url:'https://api-comment.huxiu.com/v3/index/commentList',method:'POST',contentType:'application/x-www-form-urlencoded',body:new URLSearchParams({platform:'www',object_type:'8',object_id:thread.threadId!,type,last_id:'0'}).toString()};
}

export async function resolveTechRequest(thread:CommentThread,readText:(url:string)=>Promise<string>):Promise<CommentRequest|undefined> {
  if(thread.sourceId==='huxiu')return momentRequest(thread,'1');
  const url=metadataURL(thread);if(!url)return;
  const html=await readText(url);
  // Read literal fields only; never evaluate the site's scripts or follow metadata URLs.
  const block=html.match(/\b(?:var|let|const)\s+newsInfo\s*=\s*\{([\s\S]{0,2000}?)\}\s*;/)?.[1];
  if(!block)throw new Error('IT之家 metadata missing');
  const field=(key:string)=>block.match(new RegExp(`(?:^|,)\\s*["']?${key}["']?\\s*:\\s*(["'])([^"'\\r\\n]*)\\1\\s*(?=,|$)`))?.[2];
  const newsId=field('NewsIDDes'),lapinId=field('LapinIDDes'),postDate=field('PostDate');
  if(!newsId||!/^\w{16,64}$/.test(newsId)||lapinId===undefined||!/^\w{0,64}$/.test(lapinId)||!postDate||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(postDate))throw new Error('IT之家 metadata ID/date invalid');
  const query=new URLSearchParams({NewsID:newsId,LapinID:lapinId,MaxCommentID:'0',Latest:'0',PostDate:postDate,appver:'868'});
  return {url:'https://m.ithome.com/api/comment/newscommentlistget?'+query};
}

export function fallbackTechRequest(thread:CommentThread,value:unknown):CommentRequest|undefined {
  if(thread.sourceId!=='huxiu')return;
  const root=object(value),data=object(root.data);
  if(root.success===true&&Array.isArray(data.datalist)&&data.datalist.length===0)return momentRequest(thread,'2');
}

function plain(value:unknown):string {
  if(typeof value!=='string')return '';
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<img\b[^>]*>/gi,tag=>tag.match(/\balt=["']([^"']*)["']/i)?.[1]??'').replace(/<br\s*\/?\s*>|<\/p>/gi,' ').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"}[s]??s)).replace(/&#(x[\da-f]+|\d+);/gi,(_,n:string)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/\s+/g,' ').trim();
}

export function normalizeTechComments(thread:CommentThread,value:unknown,observedAt:string):SampledComment[]|undefined {
  if(thread.sourceId!=='ithome'&&thread.sourceId!=='huxiu')return;
  const root=object(value),data=object(root.data),result=object(root.Result);
  if(thread.sourceId==='ithome'&&root.Success!==1)throw new Error('IT之家 comment API refused');
  if(thread.sourceId==='huxiu'&&root.success!==true)throw new Error('Huxiu comment API refused');
  const rows=thread.sourceId==='ithome'?result.Hlist:data.datalist;
  if(!Array.isArray(rows))throw new Error('Tech comment list missing');
  const seen=new Set<string>(),comments:SampledComment[]=[];
  for(const [index,entry] of rows.slice(0,20).entries()){
    const item=object(entry),row=thread.sourceId==='ithome'?object(item.M):item;
    if(thread.sourceId==='ithome'&&typeof row.SF==='string'&&row.SF.includes('#'))continue;
    if(thread.sourceId==='huxiu'&&(('object_id' in row&&String(row.object_id)!==thread.threadId)||('object_type' in row&&String(row.object_type)!=='8')))continue;
    if(thread.sourceId==='huxiu'&&(row.is_fold===true||row.is_fold===1||Number(row.parent_comment_id)!==0||Number(row.to_comment_id)!==0))continue;
    const id=numericId(thread.sourceId==='ithome'?row.Ci:row.comment_id);
    const text=plain(thread.sourceId==='ithome'?row.C:row.content);
    if(!id||seen.has(id)||text.length<2||text.length>600)continue;
    seen.add(id);
    const likes=thread.sourceId==='ithome'?row.S:row.agree_num;
    comments.push({id:thread.sourceId+':'+id,text,sourceId:thread.sourceId,sourceName:thread.sourceName,articleUrl:thread.articleUrl,url:thread.articleUrl,likes:typeof likes==='number'&&Number.isSafeInteger(likes)&&likes>=0?likes:undefined,rank:index+1,observedAt});
  }
  return comments;
}
