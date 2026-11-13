/** Used before persisting or printing provider errors; never expose runtime secrets. */
export function redactJobMessage(text:string) {
 let safe=text;
 for(const [name,value] of Object.entries(process.env)) {
  if(/API_KEY|TOKEN|PASSWORD|SECRET/i.test(name)&&value&&value.length>=4) safe=safe.split(value).join('[REDACTED]');
 }
 return safe.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [REDACTED]')
  .replace(/\bsk-[a-zA-Z0-9_-]+/g,'[REDACTED]');
}
