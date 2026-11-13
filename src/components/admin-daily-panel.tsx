"use client";

import {useEffect,useState} from 'react';
import {getDailyReportWindow} from '@/lib/daily-window';
import type {DailyGenerationPreview} from '@/lib/admin-daily';

export function AdminDailyPanel({disabled,revision,onGenerate,date:externalDate,onDateChange}:{disabled:boolean;revision:string;onGenerate:(date:string)=>Promise<boolean>;date?:string;onDateChange?:(date:string)=>void}) {
 const [localDate,setLocalDate]=useState(()=>getDailyReportWindow().reportDate);
 const date=externalDate??localDate;
 const setDate=onDateChange??setLocalDate;
 const [view,setView]=useState<{key:string;preview?:DailyGenerationPreview;error?:string}>({key:''});
 const key=date+'|'+revision;
 const loading=view.key!==key;
 const preview=!loading?view.preview:undefined;
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/admin/data?daily='+encodeURIComponent(date),{cache:'no-store',signal:controller.signal})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error??'读取日报窗口失败。');return data;})
   .then(data=>{if(!controller.signal.aborted)setView({key,preview:data.preview});})
   .catch(error=>{if(!controller.signal.aborted)setView({key,error:error.message});});
  return()=>controller.abort();
 },[date,key]);
 const format=(value:string)=>value.slice(0,10)+' '+value.slice(11)+':00';
 return <section className="data-card data-daily-panel" aria-labelledby="manual-daily-heading">
  <div><p className="eyebrow">DAILY REPORT</p><h2 id="manual-daily-heading">手动生成日报</h2><p className="data-muted">日报日期代表内容所属日，汇总所选日 02:00 至次日 02:00 的采样，次日凌晨 02:00 自动生成。任务后台运行，日志会持续更新。</p></div>
  <form onSubmit={event=>{event.preventDefault();if(!disabled&&preview?.hasTopics)void onGenerate(date);}}>
   <label htmlFor="daily-report-date">日报所属日期 · 北京时间<input id="daily-report-date" type="date" value={date} required onChange={event=>setDate(event.target.value)}/></label>
   {loading?<p role="status">正在检查统计窗口与历史数据…</p>:view.error?<p role="alert" className="data-error">{view.error}</p>:preview?<div className="data-daily-preview">
    <p><b>统计窗口</b><br/>{format(preview.windowStart)} → {format(preview.windowEnd)} <small>UTC+8</small></p>
    <p>可用采样 <b>{preview.snapshotCount}</b> 次 · {preview.existing?'已有日报，将直接覆盖':'尚无日报，将创建新日报'}</p>
    {!preview.complete?<p className="data-warning">提前生成 · 统计窗口尚未结束，仅使用目前已有采样。</p>:null}
    {preview.firstCollectedAt?<small>实际采样：{new Date(preview.firstCollectedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} → {new Date(preview.lastCollectedAt!).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</small>:null}
    {!preview.hasTopics?<p className="data-warning">没有可用话题，无法生成。已有日报不会被空数据覆盖。</p>:null}
   </div>:null}
   <div className="data-actions"><button className="data-primary" disabled={disabled||loading||!preview?.hasTopics}>{disabled?'请等待当前后台任务结束':preview?.existing?'重新生成并覆盖日报':'生成日报'}</button><small>会调用 AI；已有同日期日报将被覆盖。</small></div>
  </form>
 </section>;
}
