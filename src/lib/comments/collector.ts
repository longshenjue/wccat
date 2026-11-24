import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {ProviderState} from '../provider-state';
import {EvidenceStore} from '../evidence-store';
import {sanitizeEvidence} from '../evidence-content';
import {guardedWrite,readGeneration,MaintenanceError} from '../maintenance';
import {resolveCommentThread,normalizeComments,biliComments,CommentResponseError} from './adapters';
import {resolveNewsRequest} from './news';
import {resolveTechRequest,fallbackTechRequest} from './tech';
import {resolveToutiaoRequest} from './toutiao';
import {firstFeedItemEnvelope} from './first-feed-item';
import type {CommentRequest,CommentSample,CommentThread,SampledComment} from './types';

export const COMMENT_TTL=4*3600_000;
type Dependencies={fetch?:typeof fetch;now?:()=>number;sleep?:(ms:number)=>Promise<void>;dailyLimit?:number};
/** Hard bounds apply even if an upstream ignores its limit or pagination parameters. */
export class CommentCollector {
  private state:ProviderState;private request:typeof fetch;private now:()=>number;private sleep:(ms:number)=>Promise<void>;private dailyLimit:number;
  constructor(private db:Database.Database,options:Dependencies={}){
    this.state=new ProviderState(db);this.request=options.fetch??fetch;this.now=options.now??Date.now;this.sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    this.dailyLimit=Math.min(100,Math.max(1,Math.floor(options.dailyLimit??100)));
  }
  private async reserve(account:string,key:string,limit:number,generation:number){
    const owner=randomUUID();
    for(let i=0;i<6;i++){
      const result=this.state.acquire(account,key,this.now,limit,owner,generation);
      if(result.kind!=='wait')return {result,owner};
      // A peer is fetching; do not hold a worker for its full lease or start a duplicate.
      if(result.ms<1000&&i>0)return {result:{kind:'blocked' as const,reason:'in-flight'},owner};
      await this.sleep(Math.max(1,result.ms));
    }
    return {result:{kind:'blocked' as const,reason:'busy'},owner};
  }
  private async text(request:CommentRequest,generation:number,referer:string,firstFeedItem=false):Promise<string>{
    const {url}=request;
    const {result,owner}=await this.reserve('comments-network-v1','all',this.dailyLimit,generation);
    if(result.kind!=='reserved')throw new CommentResponseError('Comment network budget unavailable');
    try{
      const response=await this.request(url,{redirect:'error',signal:AbortSignal.timeout(7000),method:request.method??'GET',...(request.body!==undefined?{body:request.body}:{}),headers:{accept:'application/json,text/html;q=0.9','user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',referer,...(request.contentType?{'content-type':request.contentType}:{})} });
      if(!response.ok){await response.body?.cancel();throw new CommentResponseError('Comment HTTP '+response.status,response.status);}
      const reader=response.body?.getReader();if(!reader)throw new CommentResponseError('Empty comment response');
      const chunks:Uint8Array[]=[];let bytes=0;
      try{while(true){
        const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>512*1024)throw new CommentResponseError('Comment response exceeds byte limit');chunks.push(value);
        if(firstFeedItem){const first=firstFeedItemEnvelope(Buffer.concat(chunks).toString('utf8'));if(first!==undefined)return first;}
      }}finally{await reader.cancel().catch(()=>{});}
      if(firstFeedItem)throw new CommentResponseError('First comment-source post unresolved');
      return Buffer.concat(chunks).toString('utf8');
    }finally{
      this.state.complete('comments-network-v1','all',owner,this.now(),{},this.now(),generation);
    }
  }
  private async json(request:CommentRequest,generation:number,referer:string):Promise<unknown>{
    return JSON.parse(await this.text(request,generation,referer)) as unknown;
  }
  async collect(occurrences:Array<{sourceId:string;url:string}>):Promise<CommentSample>{
    const generation=readGeneration(this.db),comments:SampledComment[]=[],runIds:string[]=[],threads=new Map<string,CommentThread>();
    for(const item of occurrences.slice(0,30)){const thread=resolveCommentThread(item);if(thread&&!threads.has(thread.key))threads.set(thread.key,thread);if(threads.size===2)break;}
    for(const thread of threads.values()){
      const {result,owner}=await this.reserve('comments-sample-v1',thread.key,12,generation);
      if(result.kind==='cached'){
        const cached=result.payload as {comments:SampledComment[];runId:string};comments.push(...cached.comments.slice(0,20));runIds.push(cached.runId);continue;
      }
      if(result.kind!=='reserved')continue;
      try{
        let request:CommentRequest|undefined=thread.apiUrl?{url:thread.apiUrl}:undefined;
        if(thread.bvid){
          const value=await this.json({url:'https://api.bilibili.com/x/web-interface/view?bvid='+thread.bvid},generation,thread.articleUrl) as {code?:number;data?:{aid?:number}};
          if(value.code!==0||!Number.isSafeInteger(value.data?.aid)||Number(value.data?.aid)<=0)throw new CommentResponseError('Bilibili video lookup failed');
          request={url:biliComments(String(value.data!.aid))};
        }
        const readText=(url:string,firstFeedItem=false)=>this.text({url},generation,thread.articleUrl,firstFeedItem);
        request=await resolveNewsRequest(thread,readText)??await resolveTechRequest(thread,readText)??await resolveToutiaoRequest(thread,readText)??request;
        if(!request)throw new CommentResponseError('Comment request unavailable');
        let response=await this.json(request,generation,thread.articleUrl);
        const fallback=fallbackTechRequest(thread,response);
        if(fallback){request=fallback;response=await this.json(request,generation,thread.articleUrl);}
        const observedAt=new Date(this.now()).toISOString();
        // If evidence redaction would change a quotation, omit it instead of publishing altered words as verbatim.
        const commentThread=request.articleUrl?{...thread,articleUrl:request.articleUrl}:thread;
        const items=normalizeComments(commentThread,response,observedAt).filter(comment=>sanitizeEvidence(comment.text)===comment.text);
        const run=guardedWrite(this.db,()=>new EvidenceStore(this.db).recordBatch({source:{provider:'public-comments',platform:thread.sourceId,adapter:'bounded-comments-v2',capability:'comments'},status:items.length?'success':'empty',observedAt,request:{articleUrl:thread.articleUrl,commentArticleUrl:commentThread.articleUrl,apiUrl:request!.url,method:request!.method??'GET',limit:20,pages:1,nested:false,fallback:!!fallback},response:{comments:items},items:[]}),generation);
        this.state.complete('comments-sample-v1',thread.key,owner,this.now(),{comments:items,runId:run.runId},this.now()+COMMENT_TTL,generation);
        comments.push(...items);runIds.push(run.runId);
      }catch(error){
        if(error instanceof MaintenanceError)throw error;
        const status=error&&typeof error==='object'&&'status' in error?Number(error.status):0;
        const cooldown=[401,403,412,429].includes(status)?6*3600_000:30*60_000;
        this.state.fail('comments-sample-v1',thread.key,owner,this.now()+cooldown,error instanceof CommentResponseError?error.message:'Comment collection unavailable',generation);
      }
    }
    guardedWrite(this.db,()=>{
      this.db.prepare("delete from provider_request_state where account like 'comments-%' and lease_until<? and max(coalesce(expires_at,0),blocked_until)<?").run(this.now(),this.now()-7*86400_000);
    },generation);
    const unique=[...new Map(comments.map(c=>[c.id,c])).values()].slice(0,40);
    return {comments:unique,runIds:[...new Set(runIds)]};
  }
}
