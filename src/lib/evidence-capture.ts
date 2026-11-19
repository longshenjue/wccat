import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {sanitizeEvidence,parseExactJson,safeEvidenceUrl} from './evidence-content';
import type {EvidenceBatch,EvidenceItem,EvidenceMetric} from './evidence-types';
import type {RawHotItem,SourceConfig} from './types';

type RequestEvidence={url:string;method:string;body?:unknown;status?:number;payload?:unknown;truncated?:boolean;error?:string;sourceBytes?:number|null;capturedBytes?:number;declaredContentLength?:number|null;contentEncoding?:string|null};
type CaptureScope={sink:(batch:EvidenceBatch)=>void|Promise<void>;errors:unknown[];requests?:RequestEvidence[];parseError?:string};
const capture=new AsyncLocalStorage<CaptureScope>();
const limit=2*1024*1024;

export async function withEvidenceCapture<T>(sink:CaptureScope['sink'],action:()=>Promise<T>) {
  const scope:CaptureScope={sink,errors:[]};
  const result=await capture.run(scope,action);
  if(scope.errors.length)throw scope.errors[0];
  return result;
}

/** Explicit adapters already know the item mapping and source timestamps. */
export async function emitEvidenceBatch(batch:EvidenceBatch) {
  const scope=capture.getStore();if(!scope)return;
  try{await scope.sink(batch);}catch(error){scope.errors.push(error);throw error;}
}
export function evidencePersistenceFailed(error:unknown):never {
  capture.getStore()?.errors.push(error);throw error;
}

/** Keep large numeric identifiers exact in the evidence copy, independently of legacy parsing. */
function parsePayload(text:string):unknown {
  try {
    return parseExactJson(text);
  }catch{return text;}
}

export async function evidenceFetch(url:string,init?:RequestInit) {
  const requests=capture.getStore()?.requests;
  if(!requests)return fetch(url,init);
  const record:RequestEvidence={url,method:init?.method??'GET',...(typeof init?.body==='string'?{body:parsePayload(init.body)}:{})};
  requests.push(record);
  try {
    const response=await fetch(url,init);record.status=response.status;
    const declared=response.headers.get('content-length');
    record.declaredContentLength=declared!==null&&/^\d+$/.test(declared)?Number(declared):null;
    record.contentEncoding=response.headers.get('content-encoding');
    record.sourceBytes=!record.contentEncoding||record.contentEncoding==='identity'?record.declaredContentLength:null;
    const copy=response.clone(),reader=copy.body?.getReader();
    if(reader) {
      const chunks:Uint8Array[]=[];let bytes=0;
      try {
        while(true) {
          const next=await reader.read();if(next.done)break;
          const available=limit-bytes;
          if(next.value.length>available) {
            chunks.push(next.value.subarray(0,available));bytes+=available;record.truncated=true;
            void reader.cancel().catch(()=>{});break;
          }
          chunks.push(next.value);bytes+=next.value.length;
        }
        const text=Buffer.concat(chunks).toString('utf8');record.payload=record.truncated?text:parsePayload(text);
        record.capturedBytes=bytes;
        if(!record.truncated)record.sourceBytes=bytes;
        const payload=record.payload as Record<string,unknown>|null;
        if(payload&&typeof payload==='object'&&!Array.isArray(payload)) {
          const bad=Object.entries(payload).find(([key,value])=>typeof value==='number'&&(
            (key==='code'&&(value<0||(value>=400&&value<=599)))||(['error_code','status_code'].includes(key)&&value!==0)));
          if(bad)record.error=`Business ${bad[0]}=${bad[1]}: ${String(payload.message??payload.msg??payload.description??'request rejected')}`;
        }
      }catch(error){record.error=String(sanitizeEvidence(error instanceof Error?error.message:String(error)));}
    }
    return response;
  }catch(error) {
    record.error=String(sanitizeEvidence(error instanceof Error?error.message:String(error)));throw error;
  }
}

export function evidenceParseFailed(error:unknown) {
  const scope=capture.getStore();if(scope?.requests)scope.parseError=error instanceof Error?error.message:String(error);
}

function objects(value:unknown,result:Record<string,unknown>[]=[],depth=0):Record<string,unknown>[] {
  if(depth>12||result.length>=10000)return result;
  if(Array.isArray(value)){for(const child of value)objects(child,result,depth+1);}
  else if(value&&typeof value==='object') {
    const record=value as Record<string,unknown>;result.push(record);
    for(const child of Object.values(record))if(child&&typeof child==='object')objects(child,result,depth+1);
  }
  return result;
}
const titleKeys=['title','Title','word','name','subject','topic_name','widgetTitle','keyword','query'];
const idKeys=['bvid','id','itemId','contId','tid','sentence_id','topic_id','aweme_id','note_id'];
function originalItem(item:RawHotItem,candidates:Record<string,unknown>[]) {
  const url=safeEvidenceUrl(item.url),parsed=new URL(url);
  const direct=candidates.filter(record=>['url','link','topic_url','pcUrl'].some(key=>{
    if(typeof record[key]!=='string')return false;
    try{return safeEvidenceUrl(record[key] as string)===url;}catch{return false;}
  }));
  if(direct.length===1)return direct[0];
  const tokens=new Set([...decodeURIComponent(parsed.pathname).split(/[\/_-]/),...parsed.searchParams.values()]);
  const identified=candidates.filter(record=>idKeys.some(key=>record[key]!==undefined&&tokens.has(String(record[key]))));
  if(identified.length===1)return identified[0];
  const titled=candidates.filter(record=>titleKeys.some(key=>record[key]===item.title));
  return titled.length===1?titled[0]:undefined;
}

function rawMetrics(raw:Record<string,unknown>) {
  const parents=[raw,...['stat','stats','count_info','statistics'].map(key=>raw[key]).filter((value):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value))];
  const aliases:Record<string,string[]>={views:['view','views','viewCount','readCount'],plays:['play','plays','playCount','play_count'],reads:['read','reads','read_num'],
    comments:['comments','comment','comment_count','commentCount','comment_num','reply'],replies:['replies','reply_num','replyCount'],
    likes:['likes','like','like_count','likeCount','praiseTimes','digg_count','agree_num'],favorites:['favorite','favorites','collectCount','collect_count','collected_count'],
    shares:['share','shares','share_count'],danmaku:['danmaku','danmakuCount'],upvotes:['upvotes','voteup_count'],downvotes:['downvotes','votedown_count'],dislikes:['dislikes','dislike']};
  const metrics:Record<string,number|EvidenceMetric>={};
  for(const [metric,keys] of Object.entries(aliases)) {
    for(const parent of parents) {
      const key=keys.find(key=>typeof parent[key]==='number'&&Number.isFinite(parent[key])&&Number(parent[key])>=0);
      if(key){metrics[metric]=parent[key] as number;break;}
    }
  }
  // Bilibili stat.reply is a single count; explicitly flag the legacy alias rather than doubling it.
  const stat=raw.stat as Record<string,unknown>|undefined;
  if(stat&&typeof stat.reply==='number')metrics.replies={value:stat.reply,aliasOf:'comments',path:'stat.reply'};
  if(stat&&typeof stat.view==='number')metrics.plays={value:stat.view,aliasOf:'views',path:'stat.view'};
  if(typeof raw.discuss_num==='number'&&Number.isFinite(raw.discuss_num)&&raw.discuss_num>=0)
    metrics.discussions={value:raw.discuss_num,scope:'topic',unit:'platform_count',path:'discuss_num'};
  return metrics;
}

export async function captureSourceAttempt(source:SourceConfig,provider:string,action:()=>Promise<RawHotItem[]>) {
  const outer=capture.getStore();if(!outer)return action();
  const scope:CaptureScope={...outer,requests:[]},startedAt=new Date().toISOString();
  let items:RawHotItem[]=[],failure:unknown;
  try{items=await capture.run(scope,action);}catch(error){failure=error;}
  const requests=scope.requests!,failed=!!failure||!!scope.parseError||requests.some(request=>request.error||!request.status||request.status>=400);
  const truncated=requests.some(request=>request.truncated);
  const candidates=requests.flatMap(request=>objects(request.payload));
  const evidenceItems:EvidenceItem[]=items.map(item=>{
    const raw=originalItem(item,candidates);
    const platformId=raw?idKeys.map(key=>raw[key]).find(value=>typeof value==='string'||typeof value==='number'):undefined;
    return {url:item.url,title:item.title,description:item.description,rank:item.rank,heatValue:item.heatValue,heatText:item.heatText,
      platformId:platformId===undefined?undefined:String(platformId),kind:item.sourceId==='bilibili'?'video':'article',metrics:{...item.stats,...(raw?rawMetrics(raw):{})},
      payload:raw??{provenance:'normalized_only',item}};
  });
  const errors=[...(scope.parseError?[scope.parseError]:[]),...requests.flatMap(request=>request.error?[request.error]:[])];
  if(failure)errors.push(failure instanceof Error?failure.message:String(failure));
  const batch=sanitizeEvidence({id:randomUUID(),source:{provider,platform:source.id,adapter:'wccat-ingest-v1',capability:'hotlist'},startedAt,
    finishedAt:new Date().toISOString(),observedAt:items[0]?.fetchedAt??new Date().toISOString(),
    status:items.length?(failed||truncated?'partial':'success'):(failed?'failed':truncated?'partial':'empty'),
    request:requests.map(({url,method,body})=>({url,method,body})),response:requests.length?requests:undefined,responseTruncated:truncated,
    httpStatus:requests.at(-1)?.status,error:errors.length?errors.join('; '):undefined,items:evidenceItems,
    responseSourceBytes:requests.length&&requests.every(request=>request.sourceBytes!==null&&request.sourceBytes!==undefined)?requests.reduce((sum,request)=>sum+request.sourceBytes!,0):null,
    responseCapturedBytes:requests.reduce((sum,request)=>sum+(request.capturedBytes??0),0)}) as EvidenceBatch;
  try{await outer.sink(batch);}catch(error){outer.errors.push(error);throw error;}
  if(failure)throw failure;
  return items;
}
