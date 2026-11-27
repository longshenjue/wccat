/** Linear scan of bounded source HTML. No DOM execution or backtracking over malformed markup. */
export function scanResearchHtml(html:string){
 const metadata:Record<string,string>=Object.create(null),all:string[]=[],article:string[]=[],main:string[]=[],titles:string[]=[],links:string[]=[];
 const ignored:Record<string,number>=Object.create(null);let ignoredDepth=0,articleDepth=0,mainDepth=0,titleDepth=0;
 const blocked=new Set(['script','style','nav','header','footer','aside','form','svg','noscript']);
 let cursor=0;
 while(cursor<html.length){
  const start=html.indexOf('<',cursor),endText=start<0?html.length:start;
  if(endText>cursor&&!ignoredDepth){const text=html.slice(cursor,endText);if(titleDepth)titles.push(text);else{all.push(text);if(articleDepth)article.push(text);if(mainDepth)main.push(text);}}
  if(start<0)break;
  if(html.startsWith('<!--',start)){const end=html.indexOf('-->',start+4);if(end<0)break;cursor=end+3;continue;}
  let end=start+1,quote='';
  for(;end<html.length;end++){const ch=html[end];if(quote){if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;}
  if(end===html.length)break;
  const tag=html.slice(start+1,Math.min(end,start+4097)),match=/^\s*(\/?)\s*([a-z][a-z0-9:-]*)/i.exec(tag);
  cursor=end+1;if(!match)continue;
  const closing=!!match[1],name=match[2].toLowerCase();
  if(blocked.has(name)){const count=ignored[name]??0;if(closing&&count){ignored[name]=count-1;ignoredDepth--;}else if(!closing&&!/\/\s*$/.test(tag)){ignored[name]=count+1;ignoredDepth++;}continue;}
  if(ignoredDepth)continue;
  if(name==='article')articleDepth=Math.max(0,articleDepth+(closing?-1:1));
  if(name==='main')mainDepth=Math.max(0,mainDepth+(closing?-1:1));
  if(name==='title')titleDepth=Math.max(0,titleDepth+(closing?-1:1));
  if(name==='p'||name==='br'||name==='div'||/^h[1-6]$/.test(name)){all.push(' ');if(articleDepth)article.push(' ');if(mainDepth)main.push(' ');}
  if(closing||!['meta','a'].includes(name)||end-start>4096)continue;
  const attrs:Record<string,string>=Object.create(null);let at=match[0].length,count=0;
  while(at<tag.length&&count<40){
   while(at<tag.length&&!/[\w:-]/.test(tag[at]))at++;
   const begin=at;while(at<tag.length&&/[\w:-]/.test(tag[at]))at++;
   const key=tag.slice(begin,at).toLowerCase();while(at<tag.length&&/\s/.test(tag[at]))at++;
   if(tag[at]!=='=')continue;at++;while(at<tag.length&&/\s/.test(tag[at]))at++;
   let value='';if(tag[at]==='"'||tag[at]==="'"){const delimiter=tag[at++],last=tag.indexOf(delimiter,at);if(last<0)break;value=tag.slice(at,last);at=last+1;}
   else{const first=at;while(at<tag.length&&!/\s/.test(tag[at]))at++;value=tag.slice(first,at);}
   attrs[key]=value;count++;
  }
  if(name==='meta'&&attrs.content)metadata[attrs.property??attrs.name??'']=attrs.content;
  if(name==='a'&&attrs.href&&links.length<1000)links.push(attrs.href);
 }
 return {metadata,title:titles.join(' '),text:(article.length?article:main.length?main:all).join(' '),links};
}
