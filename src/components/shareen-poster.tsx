"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { WccatDailyReport } from '@/lib/daily-report';
import type { ShareEnCopy } from '@/lib/shareen-types';
import { fitShareEnCard } from '@/lib/share-export';

export function shareEnCardIdentity(report: WccatDailyReport, copy: ShareEnCopy, index: number): string {
 if (index === 0) return '01 · Daily overview';
 const topic = report.topics.find(topic=>topic.id === copy.highlights[index-1]?.topicId);
 return `${String(index+1).padStart(2,'0')} · original rank #${topic?.rank ?? '?'} · ${copy.highlights[index-1]?.hook ?? ''}`;
}

function Brand({footer=false}:{footer?:boolean}) {
 return <div className={footer?'shareen-brand shareen-brand-footer':'shareen-brand'}><strong><span>Wc</span><span>CAT</span></strong><small>CHINA, IN CONTEXT.</small></div>;
}

/** The same fixed-size article is used in the scaled preview and the export portal. */
export function ShareEnPoster({report,copy,index}:{report:WccatDailyReport;copy:ShareEnCopy;index:number}) {
 const highlight = index > 0 ? copy.highlights[index-1] : undefined;
 const topic = highlight ? report.topics.find(topic=>topic.id===highlight.topicId) : undefined;
 const highlights = new Set(copy.highlights.map(item=>item.topicId));
 return <article className={`shareen-card ${index===0?'shareen-overview':'shareen-detail'}`} lang="en" data-shareen-index={index} aria-label={shareEnCardIdentity(report,copy,index)}>
  <header className="shareen-card-header" data-fit-zone>
   <Brand/><div className="shareen-edition"><b>{report.reportDate}</b><span>DAILY HOT / SHAREEN {String(index+1).padStart(2,'0')}</span></div>
  </header>
  <div className="shareen-card-body" data-fit-zone>
   {highlight ? <>
    <div className="shareen-section-kicker"><span>A CLOSER LOOK</span><b>ORIGINAL RANK #{String(topic?.rank??'').padStart(2,'0')}</b></div>
    <h1>{highlight.hook}</h1>
    <div className="shareen-signal"><span>THE SIGNAL</span><p>{highlight.whatHappened}</p></div>
    <section className="shareen-explainer"><h2>THE CONTEXT</h2><p>{highlight.context}</p></section>
    <section className="shareen-explainer shareen-why"><h2>WHY IT MATTERS</h2><p>{highlight.whyItMatters}</p></section>
    <p className="shareen-observation">From China’s daily attention radar. Read the story in context.</p>
   </> : <>
    <div className="shareen-section-kicker"><span>WCCAT DAILY HOT / SHAREEN</span><b>{copy.overview.topics.length} STORIES. {copy.highlights.length} CLOSER LOOKS.</b></div>
    <h1>{copy.overview.headline}</h1><p className="shareen-overview-summary">{copy.overview.summary}</p>
    <div className="shareen-ranking-label"><span>THE TOP {copy.overview.topics.length}</span><span>ORIGINAL DAILY RANKING</span></div>
    <ol className="shareen-ranking">{copy.overview.topics.map(item=>{
     const original=report.topics.find(topic=>topic.id===item.id);
     return <li key={item.id} className={highlights.has(item.id)?'shareen-picked':''}><b>{String(original?.rank??'').padStart(2,'0')}</b><span>{item.title}</span>{highlights.has(item.id)?<i aria-label="Closer look">↗</i>:null}</li>;
    })}</ol>
    <div className="shareen-inside"><b>INSIDE THIS EDITION</b><span>{copy.highlights.map(item=>`#${report.topics.find(topic=>topic.id===item.topicId)?.rank??'?'} ${copy.overview.topics.find(topic=>topic.id===item.topicId)?.title??item.hook}`).join('  /  ')}</span></div>
   </>}
  </div>
  <footer className="shareen-card-footer" data-fit-zone><div><Brand footer/><p>{topic?`Observed sources: ${topic.sources.join(' · ')}`:'Observed platform trends · Not a population survey'}</p><p>{report.windowStart} → {report.windowEnd} UTC+8</p></div><b>{String(index+1).padStart(2,'0')}<small> / {String(copy.highlights.length+1).padStart(2,'0')}</small></b></footer>
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

export function ShareEnPreviewCard({report,copy,index,onDownload,disabled}:{report:WccatDailyReport;copy:ShareEnCopy;index:number;onDownload:()=>void;disabled:boolean}) {
 const root=useRef<HTMLDivElement>(null);
 const [error,setError]=useState('');
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
  return ()=>{active=false;};
 },[report,copy,index,identity]);
 return <section className="shareen-preview-card"><div className="shareen-preview-heading"><h4>{identity}</h4><button type="button" disabled={disabled||Boolean(error)} onClick={onDownload}>↓ PNG</button></div><div ref={root}><ScaledPoster width={1200} height={1500}><ShareEnPoster report={report} copy={copy} index={index}/></ScaledPoster></div>{error?<p className="data-error" role="alert">{error}</p>:null}</section>;
}
