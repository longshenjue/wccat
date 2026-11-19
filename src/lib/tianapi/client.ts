import {randomUUID} from 'node:crypto';
import {ProviderState} from '../provider-state';
import {evidenceHash,parseExactJson,sanitizeEvidence} from '../evidence-content';
import {getChinaDate} from '../date';
import {readGeneration,MaintenanceError} from '../maintenance';
import {TIANAPI_CATALOG,TIANAPI_ENDPOINTS,normalizeTianItems,type TianEndpoint} from './catalog';
import type {EvidenceBatch} from '../evidence-types';
import type {RawHotItem} from '../types';

export type TianConfig={key:string;endpoints:TianEndpoint[];dailyLimit:number};
export function readTianApiConfig(env:Readonly<Record<string,string|undefined>>=process.env):TianConfig|undefined {
 const key=env.TIANAPI_KEY?.trim();if(!key||env.TIANAPI_ENABLED==='false')return undefined;
 if(env.TIANAPI_ENABLED&&env.TIANAPI_ENABLED!=='true')throw new Error('TIANAPI_ENABLED 必须为 true 或 false');
 const dailyLimit=Number(env.TIANAPI_DAILY_LIMIT??90);
 if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>100)throw new Error('TIANAPI_DAILY_LIMIT 必须为 1–100');
 const endpoints=env.TIANAPI_ENDPOINTS===undefined?[...TIANAPI_ENDPOINTS]:env.TIANAPI_ENDPOINTS.split(',').map(value=>value.trim()).filter(Boolean);
 for(const endpoint of endpoints)if(!TIANAPI_ENDPOINTS.includes(endpoint as TianEndpoint))throw new Error('未知 TianAPI endpoint: '+endpoint);
 return {key,endpoints:[...new Set(endpoints)] as TianEndpoint[],dailyLimit};
}
export type TianResult={items:RawHotItem[];batch:EvidenceBatch};
type Options={now?:()=>number;sleep?:(ms:number)=>Promise<void>;fetch?:typeof fetch};
class ResponseLimitError extends Error {constructor(readonly prefix:string){super('TianAPI response 超过 2 MiB');}}
async function boundedBody(response:Response) {
 const reader=response.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let length=0;const limit=2*1024*1024;
 while(true){const next=await reader.read();if(next.done)break;
  if(length+next.value.length>limit){chunks.push(next.value.subarray(0,limit-length));void reader.cancel().catch(()=>{});throw new ResponseLimitError(Buffer.concat(chunks).toString('utf8'));}
  chunks.push(next.value);length+=next.value.length;
 }
 return Buffer.concat(chunks).toString('utf8');
}
function midnight(now:number){return Date.parse(getChinaDate(new Date(now))+'T00:00:00+08:00')+86400000;}
export class TianApiClient {
 readonly account:string;private now:()=>number;private sleep:(ms:number)=>Promise<void>;private fetcher:typeof fetch;
 constructor(readonly state:ProviderState,readonly config:TianConfig,options:Options={}){
  this.account=evidenceHash('tianapi:'+config.key);this.now=options.now??Date.now;
  this.sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));this.fetcher=options.fetch??((...args)=>fetch(...args));
 }
 enabled(endpoint:TianEndpoint){return this.config.endpoints.includes(endpoint);}
 private clean(value:unknown):unknown {
  const remove=(item:unknown):unknown=>typeof item==='string'?item.split(this.config.key).join('[REDACTED]'):Array.isArray(item)?item.map(remove):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).map(([key,v])=>[key,remove(v)])):item;
  return sanitizeEvidence(remove(value));
 }
 async fetch(endpoint:TianEndpoint):Promise<TianResult|undefined> {
  if(!this.enabled(endpoint))return undefined;
  const def=TIANAPI_CATALOG[endpoint],owner=randomUUID(),generation=readGeneration(this.state.db),start=this.now(),deadline=start+20000;
  const batch:EvidenceBatch={id:randomUUID(),source:{provider:'tianapi',platform:def.platform,adapter:endpoint+'-v1',capability:'hotlist',termsUrl:'https://www.tianapi.com/apiview/'+def.id,rightsStatus:'unknown',rightsNote:'已申请免费接口权限；再分发权限未确认'},
   status:'failed',startedAt:new Date(start).toISOString(),observedAt:new Date(start).toISOString(),request:{url:'https://apis.tianapi.com/'+endpoint+'/index',method:'POST',endpoint},provenance:'captured',items:[]};
  let reservation=this.state.acquire(this.account,endpoint,this.now(),this.config.dailyLimit,owner,generation);
  while(reservation.kind==='wait'&&this.now()<deadline){await this.sleep(reservation.ms);reservation=this.state.acquire(this.account,endpoint,this.now(),this.config.dailyLimit,owner,generation);}
  if(reservation.kind==='wait'||reservation.kind==='blocked')return {items:[],batch:{...batch,finishedAt:new Date(this.now()).toISOString(),provenance:'request_skipped',error:reservation.kind==='blocked'?reservation.reason:'provider-busy'}};
  if(reservation.kind==='cached'){
   const observedAt=new Date(reservation.observedAt).toISOString();const payload=reservation.payload as {result:{list:unknown[]}};
   const normalized=normalizeTianItems(endpoint,payload.result.list,observedAt);
   return {items:normalized.items,batch:{...batch,status:normalized.invalid?'partial':normalized.items.length?'success':'empty',cached:true,observedAt,sourceUpdatedAt:observedAt,finishedAt:new Date(this.now()).toISOString(),response:payload,items:normalized.evidence,provenance:'provider_cache'}};
  }
  let payload:unknown,code:number|undefined,normalized:ReturnType<typeof normalizeTianItems>;
  try{
   const response=await this.fetcher('https://apis.tianapi.com/'+endpoint+'/index',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams({key:this.config.key}).toString()});
   batch.httpStatus=response.status;
   const text=await boundedBody(response);batch.responseCapturedBytes=Buffer.byteLength(text);batch.responseSourceBytes=batch.responseCapturedBytes;
   payload=text;if(!response.ok)throw new Error('TianAPI HTTP '+response.status);
   payload=this.clean(parseExactJson(text));const envelope=payload as {code?:number;msg?:unknown;result?:{list?:unknown[]}};
   code=envelope?.code;if(code!==200)throw new Error('TianAPI code='+String(code)+' '+String(envelope?.msg??''));
   if(!envelope.result||!Array.isArray(envelope.result.list))throw new Error('TianAPI result.list 格式无效');
   normalized=normalizeTianItems(endpoint,envelope.result.list,new Date(this.now()).toISOString());
  }catch(error){
   if(error instanceof MaintenanceError)throw error;
   if(error instanceof ResponseLimitError){payload=error.prefix;batch.responseTruncated=true;batch.responseCapturedBytes=2*1024*1024;}
   const message=String(this.clean(error instanceof Error?error.message:String(error)));
   this.state.fail(this.account,endpoint,owner,[140,150,160,180,190,230,240].includes(code??0)?midnight(this.now()):this.now()+300000,message,generation);
   return {items:[],batch:{...batch,error:message,finishedAt:new Date(this.now()).toISOString(),response:payload===undefined?undefined:this.clean(payload)}};
  }
  const observedAt=this.now();
  if(!this.state.complete(this.account,endpoint,owner,observedAt,payload,observedAt+1800000,generation))return {items:[],batch:{...batch,response:payload,error:'provider-lease-lost',finishedAt:new Date(this.now()).toISOString()}};
  return {items:normalized.items,batch:{...batch,status:normalized.invalid?'partial':normalized.items.length?'success':'empty',observedAt:new Date(observedAt).toISOString(),finishedAt:new Date(this.now()).toISOString(),response:payload,items:normalized.evidence}};
 }
 status(){return this.state.status(this.account);}
}
