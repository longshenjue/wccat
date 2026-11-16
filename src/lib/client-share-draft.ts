import type { WccatDailyReport } from './daily-report';
import type { ShareEnCopy } from './shareen-types';

export type SharingDraft = {date:string;copy?:ShareEnCopy;baseReport:WccatDailyReport|null;dirty:boolean;conflict:boolean;expectedRevision:string};

function sourceVersion(report:WccatDailyReport|null) {
 return report?JSON.stringify({...report,shareEnglish:undefined,shareEn:undefined}):'';
}

/** Background polling must not overwrite edits or pair them with a different source. */
export function reconcileSharingDraft(previous:SharingDraft|undefined,date:string,report:WccatDailyReport|null,expectedRevision:string):SharingDraft {
 if(previous?.date===date&&previous.dirty) {
  const changed=previous.expectedRevision!==expectedRevision||JSON.stringify(previous.baseReport?.shareEn)!==JSON.stringify(report?.shareEn)||sourceVersion(previous.baseReport)!==sourceVersion(report);
  return {...previous,conflict:previous.conflict||changed};
 }
 return {date,copy:report?.shareEn,baseReport:report,dirty:false,conflict:false,expectedRevision};
}

/** Keep editable original-rank summaries and every post candidate in agreement. */
export function updateShareEnTop3(copy:ShareEnCopy,index:number,summary:string):ShareEnCopy {
 if(!copy.top3[index])return copy;
 const top3=copy.top3.map((topic,i)=>i===index?{...topic,summary}:topic);
 const numbered=top3.map((topic,i)=>`${['1️⃣','2️⃣','3️⃣'][i]} ${topic.summary.trim()}`);
 const isNumbered=(line:string)=>/^(?:1️⃣|2️⃣|3️⃣)(?:\s|$)/u.test(line);
 const posts=copy.posts.map(post=>{
  const lines=post.text.split('\n');
  const start=lines.findIndex(isNumbered);
  if(start>=0){
   const updated=lines.filter(line=>!isNumbered(line));
   updated.splice(start,0,...numbered);
   return {...post,text:updated.join('\n')};
  }
  // An incomplete free-text edit can be repaired from the original-rank fields.
  const cta=lines.findIndex(line=>/^WcCAT:/u.test(line));
  lines.splice(cta>=0?cta:lines.length,0,'',...numbered,'');
  return {...post,text:lines.join('\n')};
 });
 return {...copy,top3,posts};
}
