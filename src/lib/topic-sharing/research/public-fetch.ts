import {lookup} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {BlockList,isIP,type LookupFunction} from 'node:net';
import {Readable,pipeline} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {createUnzip,createBrotliDecompress} from 'node:zlib';
import type {ResearchRead} from './types';

type Address={address:string;family:number};
type Options={signal?:AbortSignal;maxBytes?:number;onRequest?:()=>void;resolve?:(host:string)=>Promise<Address[]>;request?:(url:URL,address:Address,signal:AbortSignal)=>Promise<Response>};
const blocked=new BlockList();
for(const [network,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(network,bits,'ipv4');
blocked.addSubnet('2001:db8::',32,'ipv6');

export function isPublicResearchAddress(address:string):boolean {
 const family=isIP(address);
 if(family===4)return !blocked.check(address,'ipv4');
 // Only globally routable IPv6 unicast; rejects mapped IPv4, loopback and link-local.
 return family===6&&/^[23][0-9a-f]{3}:/i.test(address)&&!blocked.check(address,'ipv6');
}
export function safeResearchUrl(value:string):URL {
 const url=new URL(value);
 if(value.length>4096||url.protocol!=='https:'||url.username||url.password||url.port||isIP(url.hostname.replace(/^\[|\]$/g,''))||!url.hostname.includes('.')||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(url.hostname))throw new Error('Unsafe research URL');
 if([...url.searchParams.keys()].some(key=>/^(?:api[_-]?key|token|access_token|password|secret|authorization)$/i.test(key)))throw new Error('Credential URL is not a research source');
 url.hash='';return url;
}

/** Pin the validated address for the actual socket; normal TLS hostname checks stay on. */
function pinnedRequest(url:URL,address:Address,signal:AbortSignal):Promise<Response>{
 return new Promise((resolve,reject)=>{
  let incoming:IncomingMessage|undefined;
  const request=httpsRequest(url,{agent:false,signal,headers:{'user-agent':'Mozilla/5.0 (compatible; WcCAT source reader)','accept':'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9','accept-encoding':'identity'},lookup:researchPinnedLookup(address)},response=>{
   incoming=response;response.on('error',()=>{});
   try{
    const headers=new Headers();for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
    const status=response.statusCode??502;
    if([204,205,304].includes(status)){response.destroy();resolve(new Response(null,{status,headers}));return;}
    const encoding=headers.get('content-encoding'),decoder=encoding==='br'?createBrotliDecompress():encoding==='gzip'||encoding==='deflate'?createUnzip():undefined;
    if(decoder){headers.delete('content-length');headers.delete('content-encoding');pipeline(response,decoder,()=>{});}
    resolve(new Response(Readable.toWeb(decoder??response) as ReadableStream<Uint8Array>,{status,headers}));
   }catch(error){response.destroy();reject(error);}
  });
  request.once('error',error=>{incoming?.destroy(error);reject(error);});request.end();
 });
}
export function researchPinnedLookup(address:Address):LookupFunction {
 return (_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family);
}
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
async function responseBytes(response:Response,signal:AbortSignal,maxBytes:number):Promise<Buffer>{
 const length=Number(response.headers.get('content-length'));
 if(length>maxBytes){await response.body?.cancel();throw new Error('Research body limit');}
 const reader=response.body?.getReader();if(!reader)throw new Error('Missing research body');
 let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){signal.throwIfAborted();const next=await abortable(reader.read(),signal);if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes){void reader.cancel().catch(()=>{});throw new Error('Research body limit');}chunks.push(next.value);}return Buffer.concat(chunks);}
 catch(error){void reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}
async function readResource(value:string,options:Options,images:boolean){
 let url=safeResearchUrl(value);const signal=AbortSignal.any([AbortSignal.timeout(8000),...(options.signal?[options.signal]:[])]);
 for(let redirects=0;redirects<=2;redirects++){
  signal.throwIfAborted();options.onRequest?.();
  const addresses=await abortable((options.resolve??(host=>lookup(host,{all:true})))(url.hostname),signal);
  if(!addresses.length||addresses.some(address=>!isPublicResearchAddress(address.address)))throw new Error('Research DNS is not public');
  signal.throwIfAborted();const response=await (options.request??pinnedRequest)(url,addresses[0],signal);
  if(response.status>=300&&response.status<400){const target=response.headers.get('location');await response.body?.cancel();if(!target||redirects===2)throw new Error('Research redirect limit');url=safeResearchUrl(new URL(target,url).href);continue;}
  if(!response.ok){await response.body?.cancel();throw new Error(`Research HTTP ${response.status}`);}
  const contentType=response.headers.get('content-type')?.split(';')[0]??'text/html';
  if(!(images?['image/jpeg','image/png','image/webp','image/avif']:['text/html','application/xhtml+xml','application/xml','text/xml','text/plain','application/json']).includes(contentType)){await response.body?.cancel();throw new Error('Unsupported research content');}
  return {url:url.href,bytes:await responseBytes(response,signal,Math.min(images?4_000_000:1_000_000,options.maxBytes??(images?4_000_000:200_000))),contentType};
 }
 throw new Error('Research redirect limit');
}

export async function readResearchResponseText(response:Response,signal:AbortSignal,maxBytes:number):Promise<string>{return (await responseBytes(response,signal,maxBytes)).toString('utf8');}
export async function readPublicResearchText(value:string,options:Options={}):Promise<ResearchRead>{const r=await readResource(value,options,false);return {url:r.url,text:r.bytes.toString('utf8'),contentType:r.contentType};}
export async function readPublicResearchImage(value:string,options:Options={}):Promise<Buffer>{return (await readResource(value,options,true)).bytes;}
