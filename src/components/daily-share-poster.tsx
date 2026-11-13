"use client";

import { useState } from 'react';
import type { WccatDailyReport } from '@/lib/daily-report';
import type { DailyShareCopy, ShareLanguage } from '@/lib/daily-share-copy';
import { sentimentLabel } from '@/lib/sentiment';

const labels = {
 zh: {radar:'中文互联网 · 每日观察',ranking:'过去 24 小时 TOP 10',analysis:'TOP 1 · 完整 AI 分析',summary:'话题摘要',detail:'详细分析',context:'背景与文化语境',platforms:'各平台态度',evidence:'依据',confidence:'置信度',metrics:'日榜信号',score:'日榜分',peak:'峰值排名',heat:'峰值热度',samples:'采样次数',sources:'来源数量',change:'分析变化',unavailable:'该话题暂无完整 AI 分析',footer:'WcCAT · What Chinese Care About Today',window:'采集窗口',generated:'生成时间',observation:'榜单信号观察，不代表全体用户的观点',red:'红侧',blue:'蓝侧',neutral:'中立',provider:'分析模型'},
 en: {radar:'CHINESE INTERNET · DAILY RADAR',ranking:'24-HOUR TOP 10',analysis:'TOP 1 · FULL AI ANALYSIS',summary:'SUMMARY',detail:'DETAILED ANALYSIS',context:'CONTEXT & CULTURAL LENS',platforms:'PLATFORM PERSPECTIVES',evidence:'Evidence',confidence:'Confidence',metrics:'DAILY SIGNALS',score:'Daily score',peak:'Peak rank',heat:'Peak heat',samples:'Observations',sources:'Sources',change:'ANALYSIS UPDATE',unavailable:'Full AI analysis is not available for this topic.',footer:'WcCAT · What Chinese Care About Today',window:'Collection window',generated:'Generated',observation:'Ranking signals reflect observed attention, not the views of all users.',red:'Red',blue:'Blue',neutral:'Neutral',provider:'Analysis model'}
};

export function DailySharePoster({report,copy,language}:{report:WccatDailyReport;copy:DailyShareCopy;language:ShareLanguage}) {
 const t=labels[language];
 const top=report.topics[0];
 const analysis=top?.aiAnalysis;
 const text=copy.analysis;
 const sentiments = {love:'Love',like:'Positive',anger:'Anger',dislike:'Disapproval',curiosity:'Curiosity',anxiety:'Concern',debate:'Debate',entertainment:'Entertainment',neutral:'Neutral'};
 return (
  <article className="share-poster" lang={language === 'zh' ? 'zh-CN' : 'en'} data-share-language={language}>
   <header className="share-poster-header">
    <div><div className="share-wordmark"><span>Wc</span>CAT <small>DAILY RADAR</small></div><p className="share-kicker">{t.radar}</p></div>
    <div className="share-date"><b>{report.reportDate}</b><span>{t.generated} · {new Date(report.generatedAt).toLocaleString(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Shanghai',hour12:false})} UTC+8</span></div>
   </header>
   <section className="share-intro"><p className="share-kicker">DAILY BRIEFING</p><h1>{copy.headline}</h1><p>{copy.overview}</p><div className="share-window">{t.window} <b>{report.windowStart}</b><span>→</span><b>{report.windowEnd}</b><span>UTC+8</span></div></section>
   <div className="share-columns">
    <section className="share-ranking">
     <h2><i />{t.ranking}<small>{report.topics.slice(0,10).length}</small></h2>
     {report.topics.slice(0,10).map((topic,index)=>{
      const topicCopy=copy.topics[index];
      return <article className="share-rank-card" key={topic.id} data-share-rank={topic.rank}>
       <div className="share-rank-number">{String(topic.rank).padStart(2,'0')}</div>
       <div className="share-rank-body"><h3>{topicCopy.title}</h3><p>{topicCopy.oneLine}</p><div className="share-topic-facts"><span>{language==='zh'?sentimentLabel(topic.sentiment):sentiments[topic.sentiment]}</span><span>{t.samples}: {topic.sampleCount ?? topic.activeHours}</span><span>{t.peak}: #{topic.peakRank}</span></div><div className="share-source-tags">{topicCopy.sources.map((source,i)=><span key={i}>{source}</span>)}</div></div>
       <b className="share-rank-score">{topic.dailyScore}</b>
      </article>;
     })}
    </section>
    <section className="share-analysis" data-share-top-id={top?.id}>
     <h2><i />{t.analysis}</h2>
     {top ? <div className="share-analysis-card">
      <div className="share-analysis-heading"><h3>{copy.topics[0].title}</h3><strong>{top.dailyScore}</strong></div>
      {top.cover ? <PosterCover src={top.cover.startsWith('/api/image')?top.cover:`/api/image?source=${encodeURIComponent(top.coverSourceId??'ai')}&url=${encodeURIComponent(top.cover)}`} /> : null}
      <section className="share-analysis-block"><h4>{t.summary}</h4><p>{text?.summary??copy.topics[0].oneLine}</p></section>
      {analysis && text ? <>
       <section className="share-versus"><div className="share-versus-labels"><strong>{text.battle.redLabel}</strong><em>VS</em><strong>{text.battle.blueLabel}</strong></div><div className="share-energy"><div style={{flex:Math.max(0,analysis.battle.redScore)}}/><div style={{flex:Math.max(0,analysis.battle.blueScore)}}/><b>{analysis.battle.redScore}</b><b>{analysis.battle.blueScore}</b></div><div className="share-rationales"><p>{text.battle.redRationale}</p><p>{text.battle.blueRationale}</p></div></section>
       <section className="share-analysis-block"><h4>{t.detail}</h4><p>{text.detailedContent}</p></section>
       <section className="share-analysis-block"><h4>{t.context}</h4><p>{text.outsiderContext}</p></section>
       <section className="share-analysis-block"><h4>{t.platforms}</h4><div className="share-platforms">{analysis.platformAnalyses.map((platform,index)=>{
        const platformCopy=text.platformAnalyses[index];
        return <article className={`share-platform stance-${platform.stance}`} key={platform.sourceId}><div><b>{platformCopy.sourceName}</b><span>{t[platform.stance]} · {t.confidence} {platform.confidence}%</span></div><p>{platformCopy.attitude}</p><p className="share-evidence">{t.evidence} · {platformCopy.evidence}</p></article>;
       })}</div></section>
       {text.changeReason?<section className="share-analysis-block"><h4>{t.change}</h4><p>{text.changeReason}</p></section>:null}
      </>:<p className="share-no-analysis">{t.unavailable}</p>}
      <section className="share-analysis-block"><h4>{t.metrics}</h4><div className="share-metrics">{[[t.score,top.dailyScore],[t.heat,top.peakHeatScore],[t.sources,top.sources.length],[t.samples,top.sampleCount ?? top.activeHours]].map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
      <p className="share-model">{t.provider} · {analysis?.model??'local-template'}</p>
     </div>:null}
    </section>
   </div>
   <footer className="share-poster-footer"><b>{t.footer}</b><span>{t.observation}</span></footer>
  </article>
 );
}

function PosterCover({src}:{src:string}) {
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 // eslint-disable-next-line @next/next/no-img-element -- Export requires a fully decoded same-origin image.
 return <img className="share-cover" src={src} alt="" onError={()=>setFailed(true)} />;
}
