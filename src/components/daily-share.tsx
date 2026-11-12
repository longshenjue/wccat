"use client";

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DailySharePoster } from './daily-share-poster';
import { getDailyShareCopy, type ShareLanguage } from '@/lib/daily-share-copy';
import type { WccatDailyReport } from '@/lib/daily-report';

export function DailyShare({report}:{report:WccatDailyReport}) {
 const [language,setLanguage]=useState<ShareLanguage>('zh');
 const [exporting,setExporting]=useState(false);
 const [message,setMessage]=useState('');
 const renderRoot=useRef<HTMLDivElement>(null);
 const englishAvailable=Boolean(report.shareEnglish);

 async function download() {
  if(exporting)return;
  setMessage('');
  setExporting(true);
  try {
   const {toBlob}=await import('html-to-image');
   await document.fonts.ready;
   // The portal is committed by the time the browser has rendered two frames.
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   const poster=renderRoot.current?.querySelector<HTMLElement>('.share-poster');
   if(!poster)throw new Error('分享图片尚未准备好，请重试。');
   const images=[...poster.querySelectorAll('img')];
   await Promise.all(images.map(async image=>{
    if(image.complete)return;
    await Promise.race([image.decode().catch(()=>undefined),new Promise(resolve=>window.setTimeout(resolve,8000))]);
   }));
   const width=poster.offsetWidth;
   const height=poster.scrollHeight;
   const blob=await toBlob(poster,{
    width,height,pixelRatio:Math.min(1.5,8192/height),
    backgroundColor:'#080d1d',skipFonts:true,includeQueryParams:true,
    filter:node=>!(node instanceof HTMLImageElement)||Boolean(node.complete&&node.naturalWidth),
    imagePlaceholder:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    fetchRequestInit:{signal:AbortSignal.timeout(10000)}
   });
   if(!blob)throw new Error('图片生成失败，请重试。');
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;
   link.download=`WcCAT-${report.reportDate}-${language}.png`;
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage(language==='zh'?'中文分享图片已生成。':'英文分享图片已生成。');
  }catch(error){setMessage(error instanceof Error?error.message:'图片生成失败，请稍后重试。');}
  finally{setExporting(false);}
 }

 let copy;
 try{copy=getDailyShareCopy(report,language);}catch{copy=undefined;}
 return <div className="daily-share-controls">
  <div className="daily-share-actions">
   <label><span className="sr-only">分享图片语言</span><select aria-label="分享图片语言" value={language} disabled={exporting} onChange={event=>{setLanguage(event.target.value as ShareLanguage);setMessage('');}}><option value="zh">中文</option><option value="en" disabled={!englishAvailable}>English{englishAvailable?'':' · 暂不可用'}</option></select></label>
   <button type="button" disabled={exporting||!copy||report.topics.length===0} onClick={download}>{exporting?'正在生成图片…':'↓ 下载分享图片'}</button>
  </div>
  <p className="daily-share-note">Top 10 + Top 1 完整分析 · PNG</p>
  {message||!copy?<p className="daily-share-message" role="status">{message||'英文内容暂不可用，请选择中文。'}</p>:null}
  {exporting&&copy?createPortal(<div className="daily-share-render-root" aria-hidden="true" ref={renderRoot}><DailySharePoster report={report} copy={copy} language={language}/></div>,document.body):null}
 </div>;
}
