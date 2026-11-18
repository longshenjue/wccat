import {createHash} from 'node:crypto';
import {redactJobMessage} from './log-redaction';

const sensitiveKey=/(?:^|[_-])(?:key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|cookie|password|secret|session(?:[_-]?id)?|sessdata|csrf(?:[_-]?token)?|xsec[_-]?token)(?:$|[_-])/i;
const trackingKey=/^(utm_.+|spm|from|from_source|share_source|share_medium|vd_source)$/i;
const credentialKey=(key:string)=>sensitiveKey.test(key)||/(?:apikey|clientsecret|token|credential|signature|smscode|verificationcode|captchacode|sessionid|password|secret|cookie)$/i.test(key.replace(/[^a-z0-9]/gi,''))||/^(x-amz-|x-goog-|ossaccesskeyid$)/i.test(key);

export function parseExactJson(text:string):unknown {
  return (JSON.parse as (text:string,reviver:(key:string,value:unknown,context?:{source?:string})=>unknown)=>unknown)(text,(_key,value,context)=>
    typeof value==='number'&&!Number.isSafeInteger(value)&&context?.source&&/^-?\d+$/.test(context.source)?context.source:value);
}

export function evidenceTime(value:string|undefined,fallback=new Date().toISOString()) {
  const time=value??fallback;
  if(!Number.isFinite(Date.parse(time))) throw new Error('Invalid evidence time / 证据时间无效');
  return new Date(time).toISOString();
}

export function safeEvidenceUrl(value:string) {
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('证据 URL 必须使用 HTTP 或 HTTPS');
  url.username='';url.password='';url.hash='';
  for(const key of [...url.searchParams.keys()]) if(credentialKey(key)||trackingKey.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return redactJobMessage(url.toString());
}

export function sanitizeEvidence(value:unknown):unknown {
  if(typeof value==='string') return redactJobMessage(value)
    .replace(/https?:\/\/[^\s"'<>]+/g,url=>{try{return safeEvidenceUrl(url);}catch{return '[INVALID URL]';}})
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|csrf[_-]?token|client[_-]?secret|sms[_-]?code|verification[_-]?code|password|cookie|authorization|secret)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;"'<>]+)/gi,'$1"[REDACTED]"');
  if(Array.isArray(value)) return value.map(sanitizeEvidence);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[
    key,credentialKey(key)||/^(headers|requestHeaders)$/i.test(key)?'[REDACTED]':sanitizeEvidence(item)
  ]));
  return value;
}

export function canonicalEvidence(value:unknown):string {
  if(Array.isArray(value)) return '['+value.map(v=>canonicalEvidence(v??null)).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonicalEvidence(v)).join(',')+'}';
  return JSON.stringify(value??null);
}
export function evidenceHash(value:string|Buffer) {return createHash('sha256').update(value).digest('hex');}
