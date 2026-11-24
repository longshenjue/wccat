/** Extract one complete leading feed object, without parsing or retaining later posts. */
export function firstFeedItemEnvelope(text:string):string|undefined {
 const start=text.match(/^\s*\{\s*"data"\s*:\s*\[\s*/)?.[0].length;if(start===undefined)return;
 if(text[start]===']')return '{"data":[]}';
 if(text[start]!=='{')return;
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'||c==='[')depth++;
  else if(c==='}'||c===']'){
   depth--;if(depth===0){
    try{const item=JSON.parse(text.slice(start,i+1)) as unknown;if(item&&typeof item==='object'&&!Array.isArray(item))return JSON.stringify({data:[item]});}catch{return;}
    return;
   }
  }
 }
}
