import type { WccatDailyReport } from './daily-report';
import type { ShareEnCopy } from './shareen-types';
import type { ZipEntry } from './client-zip';
import {shareEnImage} from './shareen-media';
import {getShareEnBattle} from './shareen-battle';
import {shareEnCommentSource} from './comments/sharing';
import {visibleCommentQuotes,excerptComment} from './comments/selection';
import {shareEnOverviewAltText} from './shareen-overview';

/** Measure at export size. All text remains visible, including when it cannot fit. */
export function fitShareEnCard(card: HTMLElement, identity: string): boolean {
 const overflows = () => [...card.querySelectorAll<HTMLElement>('[data-fit-zone]')]
  .some(zone => zone.scrollHeight > zone.clientHeight + 1 || zone.scrollWidth > zone.clientWidth + 1);
 card.classList.remove('shareen-compact');
 if (!overflows()) return false;
 card.classList.add('shareen-compact');
 if (overflows()) throw new Error(`卡片 ${identity} 超出 1200 × ${card.offsetHeight||1500} 安全区，请缩短该卡文案后重试。`);
 return true;
}

/** Keep user descriptions, replacing only our reserved generated debate suffix. */
function currentAltText(report:WccatDailyReport,copy:ShareEnCopy,index:number,text:string):string {
 // Retire only the old auto-generated three-signal description; preserve custom ALT edits.
 if(index===0&&copy.layout==='editorial'&&text.startsWith(`WcCAT, ${report.reportDate}. Selected signals from China's internet:`))return shareEnOverviewAltText(report,copy.overview.topics);
 const base=text.replace(/\sDebate energy \((?:existing (?:AI )?analysis|AI estimate)\):[^\n]*$/u,'');
 const battle=getShareEnBattle(report,copy,index);if(!battle)return base;
 const energy=`Debate energy (${battle.basis==='analysis'?'existing analysis':'AI estimate'}): ${battle.redLabel} ${battle.redScore}, ${battle.blueLabel} ${battle.blueScore}. ${battle.redRationale} ${battle.blueRationale}`;
 const source=shareEnCommentSource(report,copy,index),rows=source?visibleCommentQuotes(source.examples,source.battle,'en'):[];
 if(!rows.length)return `${base} ${energy}`;
 const comments=rows.map(({side,quote,text})=>`${side}: “${Array.from(excerptComment(text,'en').text).slice(0,170).join('')}” (${quote.sourceId}${quote.likes!==undefined?`, ${quote.likes} likes`:''}).`).join(' ');
 return `${base.slice(0,260)} ${energy.slice(0,180)} Sampled comments (AI-translated excerpts, not a poll): ${comments}`;
}

export function shareEnTextFiles(report: WccatDailyReport, copy: ShareEnCopy): ZipEntry[] {
 const selected = copy.posts.find(post => post.id === copy.selectedPostId);
 if (!selected) throw new Error('请先选择有效的英文配文。');
 const texts = [
  {name: 'post.txt', text: selected.text + '\n'},
  {name: 'alt-text.txt', text: copy.altTexts.map((text,index)=>`${String(index+1).padStart(2,'0')} · ${currentAltText(report,copy,index,text)}`).join('\n\n')+'\n'},
  {name: 'sources.txt', text: [
   'WcCAT Daily Hot · ShareEn', report.reportDate,
   `Collection window: ${report.windowStart} → ${report.windowEnd} (UTC+8)`,
   'Observed platform ranking signals, not a population survey or independently verified reporting.',
   '', ...report.topics.slice(0,10).flatMap(topic=>[
    `Original rank #${topic.rank}: ${topic.title}`,
    ...topic.links.map(link=>`${link.sourceName}: ${link.url}`), ''
   ]),
   'Focus card image URLs:',...(copy.highlights??[]).map((_,index)=>{const image=shareEnImage(report,copy,index+1);return `Card ${String(index+2).padStart(2,'0')}: ${image?.url??(copy.highlights[index].hideImage?'Image hidden by administrator':'No approved image available')}`;}),
   'Focus card debate energy:',...(copy.highlights??[]).map((h,index)=>{const battle=getShareEnBattle(report,copy,index+1);return `Original rank #${report.topics.find(t=>t.id===h.topicId)?.rank??'?'}: ${battle?`${battle.redLabel} ${battle.redScore} vs ${battle.blueLabel} ${battle.blueScore} (${battle.basis==='analysis'?'existing analysis':'AI estimate'}; relative energy, not a poll)`:'Attitude analysis unavailable'}`;}),
   ...(copy.highlights??[]).flatMap((_,index)=>{
    const source=shareEnCommentSource(report,copy,index+1);if(!source)return [];
    return visibleCommentQuotes(source.examples,source.battle,'en').flatMap(({side,quote})=>[
     `Card ${index+2} sampled ${side} comment (${source.examples!.sampleCount} sampled; not a poll):`,
     `ID: ${quote.id}`,`Source: ${quote.url}`,`Observed: ${quote.observedAt}`,`Likes: ${quote.likes??'not provided'}`,
     `Original: ${quote.text}`,`AI translation${quote.englishIsExcerpt?' (source excerpt)':''}: ${quote.englishText}`
    ]);
   })
  ].join('\n')}
 ];
 return texts.map(({name,text})=>({name,data:new TextEncoder().encode(text)}));
}

export function downloadBlob(blob: Blob, filename: string): void {
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url), 60_000);
}

export async function nextPaint(): Promise<void> {
 await document.fonts.ready;
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
}

/** Bound image decoding so a blocked upstream never hangs the download. */
export async function waitForPosterImages(root:HTMLElement,timeoutMs=8000):Promise<number> {
 const outcomes=await Promise.all([...root.querySelectorAll<HTMLImageElement>('img[data-shareen-cover]')].map(async image=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   if(!image.complete)await Promise.race([image.decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Image decode timed out')),timeoutMs);})]);
   if(!image.naturalWidth)throw new Error('Image unavailable');
   return true;
  }catch{
   image.dispatchEvent(new Event('error'));
   return false;
  }finally{if(timer)clearTimeout(timer);}
 }));
 return outcomes.filter(ready=>!ready).length;
}

/** Freeze decoded same-origin pixels. html-to-image must not fetch/cache proxy URLs a second time. */
export async function inlinePosterImages(root:HTMLElement):Promise<number> {
 let unavailable=0;
 for(const image of root.querySelectorAll<HTMLImageElement>('img[data-shareen-cover]')){
  try{
   if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw new Error('Image not decoded');
   const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   image.src=canvas.toDataURL('image/png');
  }catch{unavailable++;image.dispatchEvent(new Event('error'));}
 }
 return unavailable+await waitForPosterImages(root);
}
