import type { WccatDailyReport } from './daily-report';
import type { ShareEnCopy } from './shareen-types';
import type { ZipEntry } from './client-zip';
import {shareEnImage} from './shareen-media';
import {buildChineseDailyCards,getDailyCardBattle} from './daily-bilingual-cards';
import type {ShareLanguage} from './daily-share-copy';
import {shareEnCommentRows} from './comments/sharing';
import {excerptComment} from './comments/selection';
import {shareEnOverviewAltText} from './shareen-overview';
import type {PublicationReference} from './publications/types';
import {publicationTextFiles} from './publications/materials';

/** Use the available canvas, then compact and grow vertically without cutting source text. */
export function fitShareEnCard(card: HTMLElement, identity: string): boolean {
 const overflows = () => [...card.querySelectorAll<HTMLElement>('[data-fit-zone]')]
  .some(zone => zone.scrollHeight > zone.clientHeight + 1 || zone.scrollWidth > zone.clientWidth + 1);
 card.classList.remove('shareen-compact');
 if(card.style&&card.dataset?.shareenHeight){card.style.height=card.dataset.shareenHeight+'px';card.style.gridTemplateRows='';}
 if (!overflows()) return false;
 card.classList.add('shareen-compact');
 if(overflows()&&typeof getComputedStyle==='function'&&typeof card.querySelector==='function'){
  const header=card.querySelector<HTMLElement>('.shareen-card-header,.shareen-overview-header'),body=card.querySelector<HTMLElement>('.shareen-card-body'),footer=card.querySelector<HTMLElement>('.shareen-card-footer');
  if(header&&body&&footer){
   const style=getComputedStyle(card),number=(value:string)=>Number.parseFloat(value)||0;
   const headerHeight=Math.max(header.clientHeight,header.scrollHeight),footerHeight=Math.max(footer.clientHeight,footer.scrollHeight);
   const height=number(style.paddingTop)+number(style.paddingBottom)+2*number(style.rowGap)+headerHeight+footerHeight+body.scrollHeight+8;
   card.style.gridTemplateRows=`${headerHeight}px minmax(0,1fr) ${footerHeight}px`;
   card.style.height=Math.ceil(Math.max(card.offsetHeight,height))+'px';
  }
 }
 if (overflows()) throw new Error(`卡片 ${identity} 超出 1200 × ${card.offsetHeight||1500} 安全区，请缩短该卡文案后重试。`);
 return true;
}

/** Keep user descriptions, replacing only our reserved generated debate suffix. */
function currentAltText(report:WccatDailyReport,copy:ShareEnCopy,index:number,text:string,language:ShareLanguage='en'):string {
 if(language==='zh'){
  const battle=getDailyCardBattle(report,copy,index,language);
  const energy=battle?` AI 相对情绪能量（来源分析，非民调）：${battle.redLabel} ${battle.redScore}，${battle.blueLabel} ${battle.blueScore}。${battle.redRationale} ${battle.blueRationale}`:'';
  const rows=shareEnCommentRows(report,copy,index,language);
  const comments=rows.map(({side,quote,text})=>`${side==='red'?'红侧':side==='blue'?'蓝侧':'网友'}原文：“${excerptComment(text,'zh').text}”（${quote.sourceName}${quote.likes!==undefined?`，${quote.likes} 赞`:''}）。`).join(' ');
  return `${text}${energy}${comments?` 评论摘选（非民调）：${comments}`:''}`;
 }
 // Retire only the old auto-generated three-signal description; preserve custom ALT edits.
 if(index===0&&copy.layout==='editorial'&&text.startsWith(`WcCAT, ${report.reportDate}. Selected signals from China's internet:`))return shareEnOverviewAltText(report,copy.overview.topics);
 const base=text.replace(/\sDebate energy \((?:existing (?:AI )?analysis|AI estimate)\):[^\n]*$/u,'');
 const battle=getDailyCardBattle(report,copy,index);
 const energy=battle?`Debate energy (${battle.basis==='analysis'?'existing analysis':'AI estimate'}): ${battle.redLabel} ${battle.redScore}, ${battle.blueLabel} ${battle.blueScore}. ${battle.redRationale} ${battle.blueRationale}`:'';
 const rows=shareEnCommentRows(report,copy,index,'en');
 if(!rows.length)return `${base} ${energy}`;
 const comments=rows.map(({side,quote,text})=>`${side}: “${Array.from(excerptComment(text,'en').text).slice(0,170).join('')}” (${quote.sourceId}${quote.likes!==undefined?`, ${quote.likes} likes`:''}).`).join(' ');
 return `${base.slice(0,260)} ${energy.slice(0,180)} Selected comments (translations or labelled Chinese originals, not a poll): ${comments}`;
}

export function shareEnTextFiles(report: WccatDailyReport, englishCopy: ShareEnCopy, language:ShareLanguage='en'): ZipEntry[] {
 const copy=language==='zh'?buildChineseDailyCards(report,englishCopy):englishCopy;
 const en=language==='en';
 const selected = copy.posts.find(post => post.id === copy.selectedPostId);
 if (!selected) throw new Error(en?'请先选择有效的英文配文。':'中文配文尚未准备好。');
 const texts = [
  {name: 'post.txt', text: selected.text + '\n'},
  {name: 'alt-text.txt', text: copy.altTexts.map((text,index)=>`${String(index+1).padStart(2,'0')} · ${currentAltText(report,copy,index,text,language)}`).join('\n\n')+'\n'},
  {name: 'sources.txt', text: [
   en?'WcCAT Daily Hot · ShareEn':'WcCAT 今日热点 · 中文卡片', report.reportDate,
   `${en?'Collection window':'统计窗口'}: ${report.windowStart} → ${report.windowEnd} (UTC+8)`,
   en?'Observed platform ranking signals, not a population survey or independently verified reporting.':'内容来自已保存日报与平台榜单。榜单信号与 AI 情绪能量不代表民调或独立核实报道。',
   '', ...report.topics.slice(0,10).flatMap(topic=>[
    `${en?'Original rank':'原榜'} #${topic.rank}: ${topic.title}`,
    ...topic.links.map(link=>`${link.sourceName}: ${link.url}`),...(topic.research?.documents??[]).map(doc=>`[${doc.id}] ${doc.publisher} · ${doc.title}: ${doc.url}${doc.publishedAt?` (${doc.publishedAt})`:''}`), '',
    ...(topic.relatedDevelopments??[]).flatMap(stage=>[`${en?'Related development (separate fact)':'同一主线的其他进展（独立事实）'}: ${stage.title}`,...stage.links.map(link=>`${link.sourceName}: ${link.url}`),''])
   ]),
   en?'Focus card image URLs:':'精选详情卡配图 URL：',...(copy.highlights??[]).map((_,index)=>{const image=shareEnImage(report,copy,index+1);return `${en?'Card':'卡片'} ${String(index+2).padStart(2,'0')}: ${image?.url??(copy.highlights[index].hideImage?(en?'Image hidden by administrator':'管理员已隐藏配图'):(en?'No approved image available':'无可用的已审核配图'))}`;}),
   en?'Focus card debate energy:':'精选详情卡 AI 相对情绪能量：',...(copy.highlights??[]).map((h,index)=>{const battle=getDailyCardBattle(report,copy,index+1,language);return `${en?'Original rank':'原榜'} #${report.topics.find(t=>t.id===h.topicId)?.rank??'?'}: ${battle?`${battle.redLabel} ${battle.redScore} ${en?'vs':'对'} ${battle.blueLabel} ${battle.blueScore} (${en?(battle.basis==='analysis'?'existing analysis':'AI estimate'):'来源分析'}; ${en?'relative energy, not a poll':'相对能量，非民调'})`:(en?'Attitude analysis unavailable':'无可用情绪分析')}`;}),
   ...(copy.highlights??[]).flatMap((_,index)=>{
    return shareEnCommentRows(report,copy,index+1,language).flatMap(({side,quote})=>[
     en?`Card ${index+2} selected ${side} comment (not a poll):`:`卡片 ${index+2} ${side==='red'?'红侧':side==='blue'?'蓝侧':'网友'}评论（非民调）：`,
     `ID: ${quote.id}`,`${en?'Source':'来源'}: ${quote.url}`,`${en?'Observed':'采集时间'}: ${quote.observedAt}`,`${en?'Likes':'点赞'}: ${quote.likes??(en?'not provided':'未提供')}`,
     `${en?'Original':'原文'}: ${quote.text}`,...(en&&quote.englishText?[`AI translation${quote.englishIsExcerpt?' (source excerpt)':''}: ${quote.englishText}`]:[])
    ]);
   })
  ].join('\n')}
 ];
 return texts.map(({name,text})=>({name,data:new TextEncoder().encode(text)}));
}

/** Flat ASCII names work with the strict STORE ZIP encoder on every platform. */
export function dailyCardFilename(index:number,language:ShareLanguage):string {
 return `${language}-${String(index+1).padStart(2,'0')}-${index===0?'overview':'deep-dive'}.png`;
}

export function bilingualDailyTextFiles(report:WccatDailyReport,copy:ShareEnCopy,publication?:{reference:PublicationReference;origin:string}):ZipEntry[] {
 const files=(['en','zh'] as const).flatMap(language=>shareEnTextFiles(report,copy,language).map(file=>({...file,name:`${language}-${file.name}`})));
 const hasComments=(language:'en'|'zh')=>copy.highlights.some((_,index)=>shareEnCommentRows(report,copy,index+1,language).length>0);
 return [...files,...(publication?publicationTextFiles(publication.reference,publication.origin,{en:hasComments('en'),zh:hasComments('zh')}):[])];
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
