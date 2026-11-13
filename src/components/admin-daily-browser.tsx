"use client";
import Link from 'next/link';
import {useState} from 'react';
import {browseUrl,chinaTime,safeArticleHref,useAdminQuery,useAdminRead} from './admin-query';
import type {DailyBrowseResult} from '@/lib/admin-browse-types';

export function AdminDailyBrowser({date,revision}:{date:string;revision:string}) {
 const {params,change}=useAdminQuery();
 const {data,error,loading}=useAdminRead<DailyBrowseResult>(browseUrl('daily',{date,revision}));
 const [message,setMessage]=useState('');
 if(loading)return <p role="status">正在读取已保存日报…</p>;
 if(error)return <p role="alert" className="data-error">{error}</p>;
 const report=data?.report;
 if(!report)return <section className="data-card"><h2>{date} · 尚无日报</h2><p>该日期没有已保存日报。可以在上方检查目标窗口并生成。</p></section>;
 const active=report.topics.find(topic=>topic.id===params.get('dItem'))??report.topics[0];
 async function copy(){try{await navigator.clipboard.writeText(JSON.stringify(active,null,2));setMessage('已复制日报条目 JSON');}catch{setMessage('复制失败，可展开完整 JSON 手动复制。');}}
 return <section className="data-card admin-daily-record" aria-label="已保存日报">
  <p className="eyebrow">SAVED DAILY REPORT</p><h2>{report.headline}</h2><p>{report.overview}</p><p className="data-muted">{report.reportDate} · {data?.version?.origin==='archive'?'历史归档':'主库'} · 生成 {chinaTime(report.generatedAt)}</p><p>目标窗口 {report.windowStart} → {report.windowEnd} · 模型 {report.model} · 英文{report.shareEnglish?'已保存':'未就绪'}</p>
  {report.collection?<p className={report.collection.complete?'data-muted':'data-warning'}>{report.collection.complete?'窗口已结束':'提前生成 · 窗口未结束'} · 采样 {report.collection.sampleCount} 次 · 截至 {chinaTime(report.collection.observedUntil)}</p>:null}
  <Link className="data-download" href={'/daily?date='+encodeURIComponent(report.reportDate)}>打开日报页面 ↗</Link>
  <div className="admin-daily-grid"><nav className="admin-daily-topics" aria-label="日报条目">{report.topics.map(topic=><button key={topic.id} className={active?.id===topic.id?'selected':''} aria-pressed={active?.id===topic.id} onClick={()=>{setMessage('');change({dItem:topic.id});}}><b>#{topic.rank}</b> {topic.title}<small>日榜分 {topic.dailyScore} · 采样 {topic.sampleCount??topic.activeHours} 次</small></button>)}</nav>
   {active?<article className="admin-daily-detail"><h3>{active.title}</h3><p>{active.oneLine}</p><p className="data-muted">{active.whyItMatters}</p><p>峰值 #{active.peakRank} · 峰值热度 {active.peakHeatScore} · {active.sources.join(' / ')}</p><button onClick={copy}>复制日报条目 JSON</button>{message?<p role="status">{message}</p>:null}
    <h4>已保存 AI 分析 · {active.aiAnalysis?.model??'无'}</h4>{active.aiAnalysis?<><p>{active.aiAnalysis.summary}</p><p className="admin-preserve-text">{active.aiAnalysis.detailedContent}</p><p className="admin-preserve-text">{active.aiAnalysis.outsiderContext}</p><details><summary>完整 AI 分析</summary><pre className="admin-json">{JSON.stringify(active.aiAnalysis,null,2)}</pre></details></>:<p>此条目没有已保存分析。</p>}
    <ul className="admin-source-links">{active.links.map((link,index)=><li key={index}>{safeArticleHref(link.url)?<a href={safeArticleHref(link.url)} target="_blank" rel="noopener noreferrer">{link.sourceName} · {link.title} ↗</a>:<span>{link.sourceName} · 链接不可用</span>}</li>)}</ul><details><summary>条目完整 JSON</summary><pre className="admin-json">{JSON.stringify(active,null,2)}</pre></details>
   </article>:<p>此日报没有条目。</p>}
  </div><details><summary>中文稿件</summary><h4>公众号稿件</h4><p className="admin-preserve-text">{report.wechatDraft}</p><h4>视频口播</h4><p className="admin-preserve-text">{report.videoScript}</p></details>
  <details><summary>已保存英文内容</summary>{report.shareEnglish?<pre className="admin-json">{JSON.stringify(report.shareEnglish,null,2)}</pre>:<p>英文尚未保存；查看此页面不会触发翻译。</p>}</details>
 </section>;
}
