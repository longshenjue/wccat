"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { WccatDailyReport } from '@/lib/daily-report';
import type { ShareEnBattle, ShareEnCopy } from '@/lib/shareen-types';
import { fitShareEnCard } from '@/lib/share-export';
import { shareEnImage, type ShareEnImage } from '@/lib/shareen-media';
import { validateImageAsset, WIDE_IMAGE, SPLIT_IMAGE } from '@/lib/shareen-image-types';
import { getShareEnBattle } from '@/lib/shareen-battle';
import {CommentQuotes} from './comment-quotes';
import {shareEnCanvasHeight,shareEnCommentSource} from '../lib/comments/sharing';
export {shareEnCanvasHeight} from '../lib/comments/sharing';

export function shareEnCardIdentity(report: WccatDailyReport, copy: ShareEnCopy, index: number): string {
 if (index === 0) return '01 · Daily overview';
 const topic = report.topics.find(topic=>topic.id === copy.highlights[index-1]?.topicId);
 return `${String(index+1).padStart(2,'0')} · original rank #${topic?.rank ?? '?'} · ${copy.highlights[index-1]?.hook ?? ''}`;
}

function Brand({footer=false}:{footer?:boolean}) {
 return <div className={footer?'shareen-brand shareen-brand-footer':'shareen-brand'}><strong><span>Wc</span><span>CAT</span></strong>{footer?<small>CHINA, IN CONTEXT.</small>:null}</div>;
}

function Story({image,text}:{image:ShareEnImage|undefined;text:string}) {
 const [failedSrc,setFailedSrc]=useState('');
 const visible=image&&failedSrc!==image.src?image:undefined;
 const split=visible?.layout==='split';
 const display=split?visible.display:undefined;
 return <div className={`shareen-story${split?' shareen-story-split':''}`} style={display?{gridTemplateColumns:`${display.width}px minmax(0,1fr)`}:undefined}>
  {visible?<figure className="shareen-cover" style={display?{width:display.width,height:display.height}:{width:WIDE_IMAGE.width,height:WIDE_IMAGE.height}}>
   {/* eslint-disable-next-line @next/next/no-img-element -- Export requires a decoded same-origin image. */}
   <img data-shareen-cover src={visible.src} alt={visible.alt} onError={()=>setFailedSrc(visible.src)} style={display?{width:SPLIT_IMAGE.width,height:SPLIT_IMAGE.height,transform:`translate(${-display.left}px, ${-display.top}px)`}:undefined}/>
  </figure>:null}
  <section className="shareen-explainer"><h2>WHAT HAPPENED</h2><p>{text}</p></section>
 </div>;
}

function DebateStrip({battle}:{battle:ShareEnBattle}) {
 return <section className="shareen-debate" aria-label="Emotional opposition">
  <div className="shareen-debate-heading"><h2>THE DEBATE</h2><span>{battle.basis==='analysis'?'SOURCE ANALYSIS':'AI ESTIMATE'}</span></div>
  <div className="shareen-debate-labels"><strong>{battle.redLabel}</strong><em>VS</em><strong>{battle.blueLabel}</strong></div>
  <div className="shareen-debate-energy" role="img" aria-label={`${battle.redLabel}: ${battle.redScore}; ${battle.blueLabel}: ${battle.blueScore}. Relative AI debate energy.`}>
   <div className="shareen-debate-red" style={{flex:battle.redScore}}/><div className="shareen-debate-blue" style={{flex:battle.blueScore}}/>
   <b>{battle.redScore}</b><b>{battle.blueScore}</b>
  </div>
  <div className="shareen-debate-reasons"><p>{battle.redRationale}</p><p>{battle.blueRationale}</p></div>
 </section>;
}

/** Preview and export share a stacked brand/title/date header and safe cached image layouts. */
export function ShareEnPoster({report,copy,index}:{report:WccatDailyReport;copy:ShareEnCopy;index:number}) {
 const highlight = index > 0 ? copy.highlights[index-1] : undefined;
 const topic = highlight ? report.topics.find(topic=>topic.id===highlight.topicId) : undefined;
 const image=shareEnImage(report,copy,index);
 const battle=getShareEnBattle(report,copy,index);
 const comments=shareEnCommentSource(report,copy,index);
 const height=shareEnCanvasHeight(report,copy,index);
 const highlights = new Set(copy.highlights.map(item=>item.topicId));
 return <article className={`shareen-card ${index===0?'shareen-overview':'shareen-detail'}${height>1500?' shareen-with-comments':''}`} style={{height}} lang="en" data-shareen-index={index} data-shareen-height={height} aria-label={shareEnCardIdentity(report,copy,index)}>
  {index===0?<header className="shareen-overview-header" data-fit-zone>
   <Brand/>
   <h1 className="shareen-masthead">Daily Hot · China Top {copy.overview.topics.length}</h1>
   <p className="shareen-masthead-date">{report.reportDate}</p>
  </header>:<header className="shareen-card-header" data-fit-zone><Brand/><div className="shareen-edition"><b>{report.reportDate}</b><span>DAILY HOT / SHAREEN</span></div></header>}
  <div className="shareen-card-body" data-fit-zone>
   {highlight ? <>
    <div className="shareen-section-kicker"><span>A CLOSER LOOK</span><b>ORIGINAL RANK #{String(topic?.rank??'').padStart(2,'0')}</b></div>
    <h1>{highlight.hook}</h1>
    <Story key={image?.src??'no-image'} image={image} text={highlight.whatHappened}/>
    {battle?<DebateStrip battle={battle}/>:null}
    {comments?<CommentQuotes {...comments} language="en"/>:null}
    <section className="shareen-explainer shareen-why"><h2>WHY IT MATTERS</h2><p>{highlight.whyItMatters}</p></section>
   </> : <>
    <div className="shareen-ranking-label"><span>THE TOP {copy.overview.topics.length}</span><span>ORIGINAL DAILY RANKING</span></div>
    <ol className="shareen-ranking">{copy.overview.topics.map(item=>{
     const original=report.topics.find(topic=>topic.id===item.id);
     return <li key={item.id} className={highlights.has(item.id)?'shareen-picked':''}><b>{String(original?.rank??'').padStart(2,'0')}</b><span>{item.title}</span>{highlights.has(item.id)?<i aria-label="Closer look">↗</i>:null}</li>;
    })}</ol>
   </>}
  </div>
  <footer className="shareen-card-footer" data-fit-zone><div><Brand footer/><p>{topic?'Source image and links: see sources.txt':'Highlighted stories have a closer-look card'}</p><p>{report.windowStart} → {report.windowEnd} UTC+8</p></div><b>{String(index+1).padStart(2,'0')}<small> / {String(copy.highlights.length+1).padStart(2,'0')}</small></b></footer>
 </article>;
}

/** CSS transforms preserve the actual card dimensions while fitting a narrow viewport. */
export function ScaledPoster({width,height,children}:{width:number;height?:number;children:ReactNode}) {
 const host=useRef<HTMLDivElement>(null);
 const inner=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({scale:0.25,height:height??1500});
 useLayoutEffect(()=>{
  const resize=()=>{
   if (!host.current || !inner.current) return;
   const scale=Math.min(1, host.current.clientWidth/width);
   const measured=height??inner.current.scrollHeight;
   setSize(previous=>previous.scale===scale&&previous.height===measured?previous:{scale,height:measured});
  };
  resize();
  const observer=new ResizeObserver(resize);
  if(host.current)observer.observe(host.current);
  if(inner.current)observer.observe(inner.current);
  return ()=>observer.disconnect();
 },[height,width,children]);
 return <div className="shareen-scaled-host" ref={host} style={{height:size.height*size.scale}}><div className="shareen-scaled-inner" ref={inner} style={{width,transform:`scale(${size.scale})`}}>{children}</div></div>;
}

export function ShareEnPreviewCard({report,copy,index,onDownload,disabled,onReprocess,processingDisabled=false}:{report:WccatDailyReport;copy:ShareEnCopy;index:number;onDownload:()=>void;disabled:boolean;onReprocess?:()=>void;processingDisabled?:boolean}) {
 const root=useRef<HTMLDivElement>(null);
 const [error,setError]=useState('');
 const [failedImage,setFailedImage]=useState('');
 const image=shareEnImage(report,copy,index);
 const imageSrc=image?.src;
 const asset=image?.processed?validateImageAsset(copy.highlights[index-1]?.imageAsset):undefined;
 const identity=shareEnCardIdentity(report,copy,index);
 useLayoutEffect(()=>{
  let active=true;
  const check=()=>{
   const card=root.current?.querySelector<HTMLElement>('.shareen-card');
   if(!card||!active)return;
   try {fitShareEnCard(card,identity);setError('');}
   catch(error){setError(error instanceof Error?error.message:'卡片排版失败。');}
  };
  check();
  void document.fonts.ready.then(check);
  const host=root.current;
  const afterImage=(event:Event)=>{if(event.target instanceof HTMLImageElement)setFailedImage(event.type==='error'?imageSrc??'':'');requestAnimationFrame(check);};
  host?.addEventListener('load',afterImage,true);
  host?.addEventListener('error',afterImage,true);
  return ()=>{active=false;host?.removeEventListener('load',afterImage,true);host?.removeEventListener('error',afterImage,true);};
 },[report,copy,index,identity,imageSrc]);
 return <section className="shareen-preview-card"><div className="shareen-preview-heading"><h4>{identity}</h4><div className="shareen-preview-actions">{index>0&&onReprocess?<button type="button" disabled={disabled||processingDisabled} onClick={onReprocess}>重新处理配图</button>:null}<button type="button" disabled={disabled||Boolean(error)} onClick={onDownload}>↓ PNG</button></div></div><div ref={root}><ScaledPoster width={1200} height={shareEnCanvasHeight(report,copy,index)}><ShareEnPoster report={report} copy={copy} index={index}/></ScaledPoster></div>{index>0&&imageSrc&&failedImage!==imageSrc?<p className="data-muted" role="status">{image?.processed?`配图已就绪 · ${image.layout==='split'?'分栏 400 × 480（完整原图）':'通栏 1072 × 360'}${asset?.reason?` · ${asset.reason}`:''}`:'原图预览 · 待处理，当前完整显示原图'}</p>:null}{index>0&&(!imageSrc||failedImage===imageSrc)?<p className="data-muted">配图已隐藏或不可用，已自动收起图片区。</p>:null}{index>0&&!getShareEnBattle(report,copy,index)?<p className="data-muted">情绪条尚未就绪，请查看生成日志。重新生成 ShareEn 会尝试补齐；“补齐配图”只处理照片。</p>:null}{error?<p className="data-error" role="alert">{error}</p>:null}</section>;
}
