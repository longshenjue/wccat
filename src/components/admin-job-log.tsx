"use client";

import {useEffect,useState} from 'react';
import type {JobLogs} from '@/lib/admin-job-logs';

export function AdminJobLog({id,status,defaultOpen=false}:{id:string;status:string;defaultOpen?:boolean}) {
 const [open,setOpen]=useState(defaultOpen);
 const [view,setView]=useState<{id:string;logs?:JobLogs;error?:string}>({id:''});
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();
  let timer:number|undefined;
  const active=status==='queued'||status==='running';
  async function load() {
   try {
    const response=await fetch('/api/admin/data?logs='+encodeURIComponent(id),{cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error??'读取日志失败。');
    if(!controller.signal.aborted)setView({id,logs:data});
   } catch(error) {
    if(!controller.signal.aborted)setView({id,error:error instanceof Error?error.message:'读取日志失败。'});
   } finally {
    if(active&&!controller.signal.aborted)timer=window.setTimeout(load,2000);
   }
  }
  void load();
  return()=>{controller.abort();window.clearTimeout(timer);};
 },[id,status,open]);
 const current=view.id===id?view:undefined;
 return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>生成日志 · 任务 {id.slice(0,8)}</summary>{open?<div className="data-task-log">
  {current?.error?<p className="data-error" role="status">{current.error}</p>:null}
  {current?.logs?.truncated?<p className="data-warning">日志已截断，仅保留限量内容。</p>:null}
  <div className="data-log-lines" role="region" aria-label="日报生成日志" tabIndex={0}>
   {!current?.logs?<p>正在读取日志…</p>:!current.logs.entries.length?<p>暂无日志；旧日志可能已按保留上限回收。</p>:current.logs.entries.map((line,index)=><div className={'data-log-line '+line.level} key={index}><time>{new Date(line.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</time><span>{line.level.toUpperCase()}</span><pre>{line.message}</pre></div>)}
  </div>
 </div>:null}</details>;
}
