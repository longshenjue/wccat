import {createHmac, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';

export const ADMIN_COOKIE='wccat_admin';
export const SESSION_SECONDS=8*3600;
export class AdminError extends Error { constructor(message:string,public status=400){super(message);} }
const attempts=new Map<string,{count:number;until:number}>();
let globalAttempts={count:0,until:0};
export function hashAdminPassword(password:string){
 if(password.length<12||password.length>1024)throw new Error('Password must contain 12–1024 characters.');
 const salt=randomBytes(16).toString('hex');
 return 'scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex');
}
export function adminConfigured(){
 return /^scrypt[:$][a-f0-9]{32}[:$][a-f0-9]{128}$/.test(process.env.WCCAT_ADMIN_PASSWORD_HASH??'')&&(process.env.WCCAT_ADMIN_SESSION_SECRET?.length??0)>=32;
}
export function verifyAdminPassword(password:string){
 if(!adminConfigured()||typeof password!=='string'||password.length>1024)return false;
 const [,salt,hash]=process.env.WCCAT_ADMIN_PASSWORD_HASH!.split(/[:$]/);
 return timingSafeEqual(Buffer.from(hash,'hex'),scryptSync(password,salt,64));
}
function sign(payload:string){
 return createHmac('sha256',process.env.WCCAT_ADMIN_SESSION_SECRET!+process.env.WCCAT_ADMIN_PASSWORD_HASH!).update(payload).digest('base64url');
}
export function createAdminSession(now=Date.now()){
 if(!adminConfigured())throw new AdminError('管理员入口尚未配置。',503);
 const payload=Buffer.from(JSON.stringify({exp:now+SESSION_SECONDS*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return payload+'.'+sign(payload);
}
export function verifyAdminSession(token:string,now=Date.now()){
 if(!adminConfigured()||!token||token.length>512)return false;
 try{
  const parts=token.split('.');
  if(parts.length!==2)return false;
  const expected=Buffer.from(sign(parts[0])),actual=Buffer.from(parts[1]);
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return false;
  const {exp,nonce}=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  return typeof nonce==='string'&&Number.isFinite(exp)&&exp>now&&exp<=now+SESSION_SECONDS*1000;
 }catch{return false;}
}
export function requestToken(request:Request){
 const match=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(ADMIN_COOKIE+'='));
 return match?.slice(ADMIN_COOKIE.length+1)??'';
}
export function requireSameOrigin(request:Request){
 try{
  const origin=new URL(request.headers.get('origin')??'');
  const host=request.headers.get('host')??new URL(request.url).host;
  if(origin.host!==host||!['http:','https:'].includes(origin.protocol)||(process.env.NODE_ENV==='production'&&origin.protocol!=='https:'))throw new Error();
 }catch{throw new AdminError('请求来源不匹配，请从本站管理页面操作。',403);}
}
export function requireAdmin(request:Request,mutate=false){
 if(!adminConfigured())throw new AdminError('管理员入口尚未配置。',503);
 if(!verifyAdminSession(requestToken(request)))throw new AdminError('请先登录管理员。',401);
 if(mutate)requireSameOrigin(request);
}
export function loginAllowed(key:string,now=Date.now()){
 if(globalAttempts.until<=now)globalAttempts={count:0,until:now+15*60*1000};
 if(++globalAttempts.count>30)return false;
 for(const [ip,value] of attempts)if(value.until<=now)attempts.delete(ip);
 let entry=attempts.get(key);
 if(!entry){
  if(attempts.size>=1000)return false;
  entry={count:0,until:now+15*60*1000};attempts.set(key,entry);
 }
 return ++entry.count<=5;
}
export async function readAdminJson(request:Request,maxBytes=8192):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.includes('application/json'))throw new AdminError('需要 JSON 请求。',415);
 const reader=request.body?.getReader();if(!reader)throw new AdminError('请求为空。');
 const chunks:Uint8Array[]=[];let bytes=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new AdminError('请求过大。',413);}chunks.push(value);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();
  return body;
 }catch(error){if(error instanceof AdminError)throw error;throw new AdminError('请求格式无效。');}
}
export function adminErrorResponse(error:unknown){
 return Response.json({error:error instanceof AdminError?error.message:'操作失败，请查看服务日志。'},{status:error instanceof AdminError?error.status:500,headers:{'cache-control':'no-store'}});
}

