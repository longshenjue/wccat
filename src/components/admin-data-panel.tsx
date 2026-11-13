"use client";
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {getChinaDate} from '@/lib/date';
import type {AdminJob} from '@/lib/admin-jobs';
import type {DataSummary} from '@/lib/admin-data-stats';
import type {CleanupPreview} from '@/lib/data-preview';
import {AdminDailyPanel} from './admin-daily-panel';
import {AdminJobLog} from './admin-job-log';
import {AdminHourlyBrowser} from './admin-hourly-browser';
import {AdminDailyBrowser} from './admin-daily-browser';
import {useAdminQuery} from './admin-query';
type Confirmation={title:string;phrase:string;body:Record<string,unknown>;preview?:CleanupPreview;download:boolean};
const bytes=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':(n/1024).toFixed(1)+' KiB';
const statuses:Record<string,string>={queued:'等待执行',running:'正在执行',ready:'可下载',complete:'已完成',partial:'已生成 · 有警告',failed:'失败',cancelled:'已取消',expired:'临时文件已移除'};
const kinds:Record<string,string>={preview:'清理预览',export:'归档下载',cleanup:'小时数据清理',prepare:'启用空间回收',reclaim:'回收空闲空间',daily:'手动生成日报'};
async function api(path='',body?:Record<string,unknown>){
 const response=await fetch('/api/admin/'+path,{...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw new Error(result.error??'请求失败。');
 return result;
}
export function AdminDataPanel(){
 const today=getChinaDate();
 const {params,change}=useAdminQuery();
 const tabs=[['overview','概览'],['hourly','小时报'],['daily','日报'],['storage','归档与存储'],['tasks','任务日志']];
 const tab=tabs.some(([key])=>key===params.get('tab'))?params.get('tab')!:'overview';
 const dailyDate=params.get('dDate')??today;
 const [authenticated,setAuthenticated]=useState<boolean|null>(null),[configured,setConfigured]=useState(true);
 const [password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [summary,setSummary]=useState<DataSummary|null>(null),[jobs,setJobs]=useState<AdminJob[]>([]);
 const start=params.get('sStart')??today.slice(0,7)+'-01',end=params.get('sEnd')??today,mode=params.get('sMode')==='daily'?'daily':'full';
 const setStart=(value:string)=>change({sStart:value}),setEnd=(value:string)=>change({sEnd:value}),setMode=(value:string)=>change({sMode:value});
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null),[phrase,setPhrase]=useState(''),[ack,setAck]=useState(false),[ackMissing,setAckMissing]=useState(false);
 const version=useRef('');
 const active=jobs.some(job=>['queued','running'].includes(job.status));
 const previewJob=jobs.find(job=>job.kind==='preview'&&job.status==='complete'&&job.input.range?.start===start&&job.input.range?.end===end);
 const preview=previewJob?.result.preview,previewId=previewJob?.result.previewId;
 const loadSummary=useCallback(async()=>{const data=await api('data');setSummary(data.summary);setJobs(data.jobs);},[setSummary,setJobs]);
 useEffect(()=>{
  let stopped=false;
  api('session').then(data=>{if(!stopped){setConfigured(data.configured);setAuthenticated(data.authenticated);}}).catch(error=>{if(!stopped){setAuthenticated(false);setMessage(error.message);}});
  return()=>{stopped=true;};
 },[]);
 useEffect(()=>{
  if(!authenticated)return;
  let stopped=false;
  api('data').then(data=>{if(!stopped){setSummary(data.summary);setJobs(data.jobs);}}).catch(error=>{if(!stopped)setMessage(error.message);});
  const timer=window.setInterval(()=>{
   api('data?jobs=1').then(data=>{
    if(stopped)return;
    setJobs(data.jobs);
    const next=data.jobs.map((job:AdminJob)=>job.id+':'+job.status).join('|');
    if(version.current!==next&&!data.jobs.some((job:AdminJob)=>['queued','running'].includes(job.status)))loadSummary().catch(error=>setMessage(error.message));
    version.current=next;
   }).catch(error=>{if(!stopped)setMessage(error.message);});
  },2000);
  return()=>{stopped=true;window.clearInterval(timer);};
 },[authenticated,loadSummary]);
 async function submit(body:Record<string,unknown>){
  setBusy(true);setMessage('');
  try{const result=await api('data',body);if(result.job)setJobs(old=>[result.job,...old.filter(job=>job.id!==result.job.id)]);else await loadSummary();return true;}
  catch(error){setMessage(error instanceof Error?error.message:'操作失败。');return false;}
  finally{setBusy(false);}
 }
 function openConfirm(value:Confirmation){setConfirmation(value);setPhrase('');setAck(false);setAckMissing(false);}
 async function confirmCleanup(id:string,exportJobId?:string){
  try{const data=await api('data?preview='+encodeURIComponent(id));openConfirm({title:exportJobId?'下载后清理小时数据':'仅保留日报，清理小时数据',phrase:'清理小时数据',body:{action:'cleanup',previewId:id,...(exportJobId?{exportJobId}:{discardHourly:true})},preview:data.preview,download:Boolean(exportJobId)});}
  catch(error){setMessage(error instanceof Error?error.message:'预览失败。');}
 }
 async function login(event:React.FormEvent){
  event.preventDefault();setBusy(true);setMessage('');
  try{await api('session',{password});setPassword('');setAuthenticated(true);}
  catch(error){setMessage(error instanceof Error?error.message:'登录失败。');}
  finally{setBusy(false);}
 }
 async function logout(){await fetch('/api/admin/session',{method:'DELETE'});setAuthenticated(false);setSummary(null);setJobs([]);}
 const disabled=busy||active;
 const dailyRevision=jobs.filter(job=>job.kind==='daily').map(job=>job.id+':'+job.status).join('|');
 if(authenticated===null)return <main className="data-admin"><p role="status">正在检查管理员会话…</p></main>;
 if(!authenticated)return <main className="data-admin data-admin-login"><Link href="/daily" className="data-admin-back">← 返回日报</Link><section className="data-card"><p className="eyebrow">WcCAT · ADMIN</p><h1>数据管理</h1><p className="data-muted">管理员登录后，可以查看小时报、日报与趋势，生成日报，下载归档并管理存储空间。</p>{configured?<form onSubmit={login}><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy} className="data-primary">{busy?'正在登录…':'登录管理后台'}</button></form>:<p>管理员入口尚未配置。请先按部署文档设置运行时管理员密码散列与会话密钥。</p>}{message?<p role="alert" className="data-error">{message}</p>:null}</section></main>;
 return <main className="data-admin">
  <header className="data-admin-header"><div><p className="eyebrow">WcCAT · ADMIN</p><h1>日报与数据管理</h1><p className="data-muted">历史查询与热度趋势 · 日报生成 · 数据归档</p></div><nav><Link href="/daily">查看日报 ↗</Link><button onClick={()=>loadSummary().catch(error=>setMessage(error.message))} disabled={busy}>刷新状态</button><button onClick={logout}>退出登录</button></nav></header>
  <nav className="admin-tabs" role="tablist" aria-label="后台功能">{tabs.map(([key,label],index)=><button key={key} role="tab" id={'admin-tab-'+key} aria-controls="admin-tab-panel" aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>change({tab:key})} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;change({tab:tabs[next][0]});(event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();}}}>{label}</button>)}</nav>
  {active?<div className="admin-task-banner" role="status"><span>后台任务进行中 · {jobs.find(job=>['queued','running'].includes(job.status))?.progress||'准备执行'}</span><button onClick={()=>change({tab:'tasks'})}>查看任务日志</button></div>:null}
  {message?<p className="data-error" role="alert">{message}</p>:null}
  <section id="admin-tab-panel" role="tabpanel" aria-labelledby={'admin-tab-'+tab}>
  {tab==='hourly'?<AdminHourlyBrowser/>:null}
  {tab==='daily'?<><AdminDailyPanel disabled={disabled} revision={dailyRevision} date={dailyDate} onDateChange={date=>change({dDate:date,dItem:null})} onGenerate={async date=>{const ok=await submit({action:'daily',reportDate:date});if(ok)change({tab:'tasks'});return ok;}}/><AdminDailyBrowser date={dailyDate} revision={dailyRevision}/></>:null}
  {tab==='overview'||tab==='storage'?<>
  {summary?<section className="data-stat-grid" aria-label="存储用量">
   <div className="data-card"><span>主数据库</span><strong>{bytes(summary.storage.databaseBytes)}</strong><small>WAL {bytes(summary.storage.walBytes)}</small></div>
   <div className="data-card"><span>持久卷剩余</span><strong>{bytes(summary.storage.availableBytes)}</strong><small>按当前挂载文件系统统计</small></div>
   <div className="data-card"><span>临时下载文件</span><strong>{bytes(summary.storage.exportsBytes)}</strong><small>下载清理后移除；可单独移除</small></div>
   <div className="data-card"><span>已注册历史归档</span><strong>{summary.archiveCount} 份</strong><small>占用 {bytes(summary.storage.archivesBytes)}</small></div>
  </section>:<p role="status">正在读取容量与月份统计…</p>}
  </>:null}
  {tab==='overview'?<section className="data-card"><h2>管理工作台</h2><p className="data-muted">主库包含 {summary?.months.length??0} 个月份数据；业务日报保留，小时明细按需归档清理。</p><div className="admin-overview-links">{tabs.slice(1).map(([key,label])=><button key={key} onClick={()=>change({tab:key})}>{label} →</button>)}</div><h3>主库数据摘要</h3><div className="data-month-table"><table><thead><tr><th>月份</th><th>小时快照</th><th>日报</th></tr></thead><tbody>{summary?.months.map(month=><tr key={month.month}><td>{month.month}</td><td>{month.snapshots}</td><td>{month.reports}</td></tr>)}</tbody></table></div></section>:null}
  {tab==='storage'?<>
  <div className="data-management-grid">
   <section className="data-card"><h2>选择数据范围</h2><p className="data-muted">日期均按北京时间计算，包含结束日期当天。最近48小时和最新小时记录不会被清理。</p><div className="data-range"><label>开始日期<input type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label><label>结束日期<input type="date" value={end} min={start} max={today} onChange={e=>setEnd(e.target.value)}/></label></div>
    <button disabled={disabled||!start||!end} onClick={()=>submit({action:'preview',range:{start,end}})} className="data-primary">生成范围预览</button>
    {preview?<div className="data-preview" aria-live="polite"><h3>{start} 至 {end}</h3><p>可清理 <b>{preview.counts.snapshots}</b> 个小时快照，保护 <b>{preview.protected}</b> 个近期/最新快照。</p><p>保留现有全部 <b>{preview.dailyKept}</b> 份日报，包括已生成的分析、稿件与英文。</p><p>选中小时内容估算 {bytes(preview.estimatedBytes)}，实际释放量以任务结果为准。</p>{preview.daysWithoutReports.length?<p className="data-warning">没有已生成日报覆盖的日期：{preview.daysWithoutReports.join('、')}。清理不会补生成日报。</p>:null}
     <label>下载内容<select value={mode} onChange={e=>setMode(e.target.value as 'full'|'daily')}><option value="full">完整归档 · 可恢复小时历史和日报</option><option value="daily">仅日报 · 不包含小时历史</option></select></label>
     <div className="data-actions"><button disabled={disabled} onClick={()=>submit({action:'export',range:{start,end},mode,previewId})}>生成下载归档</button><button className="data-danger" disabled={disabled||preview.counts.snapshots===0} onClick={()=>confirmCleanup(previewId!)}>保留日报，清理小时数据</button></div>
    </div>:<p className="data-muted data-tip">可以积累多个月后，仅选择其中一个月处理。下载不会自动删除数据。</p>}
   </section>
   <section className="data-card"><h2>主库月份</h2><p className="data-muted">点击月份快速选择。体积为已存内容的估算，不等同于磁盘分配量。</p><div className="data-month-table"><table><thead><tr><th>月份</th><th>小时</th><th>日报</th><th>内容估算</th></tr></thead><tbody>{summary?.months.map(row=><tr key={row.month}><td><button disabled={disabled} onClick={()=>{const last=new Date(Date.UTC(Number(row.month.slice(0,4)),Number(row.month.slice(5,7)),0)).toISOString().slice(0,10);change({sStart:row.month+'-01',sEnd:last>today?today:last});}}>{row.month}</button></td><td>{row.snapshots}</td><td>{row.reports}</td><td>{bytes(row.estimatedBytes)}</td></tr>)}</tbody></table>{summary?.months.length===0?<p>主库还没有业务数据。</p>:null}</div></section>
  </div>
  <section className="data-card data-maintenance"><div><h2>空间回收</h2><p className="data-muted">{summary?.storage.incremental?'已启用增量回收。清理任务会自动归还空闲页面。':'旧数据库尚未启用增量回收。建议在数据较少时初始化，过程保留全部业务记录，并短暂暂停写入。'}</p><small>主库可复用空页 {summary?bytes(summary.storage.reusableBytes):'—'}；它们与已归还磁盘的空间不同。</small></div><div className="data-actions">{!summary?.storage.incremental?<button disabled={disabled} onClick={()=>openConfirm({title:'启用空间回收',phrase:'启用空间回收',body:{action:'prepare'},download:false})}>初始化空间回收</button>:null}<button disabled={disabled} onClick={()=>submit({action:'reclaim'})}>回收空闲空间</button></div></section>
  </>:null}
  {tab==='tasks'?<section className="data-card"><h2>任务与下载</h2><p className="data-muted">后台任务独立运行，关闭此页面后仍会继续。临时文件在确认清理后移除；超过24小时的旧文件将在下一次导出时回收。</p><div className="data-jobs">
   {jobs.map(job=><article className="data-job" key={job.id}><header><strong>{kinds[job.kind]}</strong><span className={'data-badge '+job.status}>{statuses[job.status]??job.status}</span><time>{new Date(job.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</time></header>{job.input.range?<p>{job.input.range.start} 至 {job.input.range.end}</p>:null}<p className="data-muted">{job.progress}</p>{job.error?<p role="status" className="data-error">{job.error}</p>:null}
    {job.kind==='daily'?<><p>日报日期：{job.input.reportDate} · 北京时间 02:00 截止</p>{job.result.daily?<div><p>话题 {job.result.daily.topicCount} 个 · 稿件模型 {job.result.daily.model} · TOP1 分析 {job.result.daily.analysisModel} · 英文{job.result.daily.englishReady?'已就绪':'未就绪'}</p><Link className="data-download" href={'/daily?date='+encodeURIComponent(job.result.daily.reportDate)}>查看该日日报 ↗</Link></div>:null}<AdminJobLog id={job.id} status={job.status} defaultOpen={job.status==='queued'||job.status==='running'||jobs.find(item=>item.kind==='daily')?.id===job.id}/></>:null}
    {job.kind==='export'&&job.result.files?.map(file=><div className="data-file" key={file.id}><b>{file.meta.month} · {file.meta.mode==='full'?'完整归档':'仅日报'}</b><small>{file.name}</small><code>SHA-256: {file.sha256}</code>{job.status==='ready'?<a className="data-download" href={'/api/admin/data?download='+job.id+'&file='+file.id} download>{file.downloaded?'再次下载':'下载文件'}</a>:null}</div>)}
    {job.kind==='export'&&job.status==='ready'?<div className="data-actions">{job.input.mode==='full'?<button className="data-danger" disabled={disabled||!job.result.files?.every(file=>file.downloaded)} onClick={()=>confirmCleanup(job.input.previewId!,job.id)}>已保存文件，清理对应小时数据</button>:null}<button disabled={disabled} onClick={()=>openConfirm({title:'移除服务器临时归档',phrase:'移除临时归档',body:{action:'discard',id:job.id},download:false})}>移除临时下载文件</button></div>:null}
    {job.result.cleanup?<p className={job.result.cleanup.reclaimed?'data-success':'data-warning'}>已删除 {job.result.cleanup.deleted.snapshots} 个小时快照；日报保留。{job.result.cleanup.reclaimed?'实际回收主库及WAL约 '+bytes(job.result.cleanup.reclaimedBytes):job.result.cleanup.reclaimError+' 可使用上方“回收空闲空间”重试。'}</p>:null}
    {['queued','running'].includes(job.status)&&['preview','export'].includes(job.kind)?<button disabled={busy} onClick={()=>submit({action:'cancel',id:job.id})}>取消任务</button>:null}
   </article>)}
   {jobs.length===0?<p className="data-muted">还没有管理任务。</p>:null}
  </div></section>:null}
  </section>
  {confirmation?<div className="data-modal-backdrop"><section className="data-card data-modal" role="dialog" aria-modal="true" aria-labelledby="data-confirm-title"><h2 id="data-confirm-title">{confirmation.title}</h2>{confirmation.preview?<><p>范围：{confirmation.preview.range.start} 至 {confirmation.preview.range.end}</p><p>将清理 {confirmation.preview.counts.snapshots} 个小时快照，全部已生成日报保留。</p><p className="data-warning">小时历史无法从日报重新还原。</p><label className="data-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{confirmation.download?'我已保存全部完整归档，并核对文件校验值。':'我确认放弃此范围的小时历史，只保留已生成日报。'}</label>{confirmation.preview.daysWithoutReports.length?<label className="data-check"><input type="checkbox" checked={ackMissing} onChange={e=>setAckMissing(e.target.checked)}/>允许清理没有日报覆盖的日期：{confirmation.preview.daysWithoutReports.join('、')}</label>:null}</>:<p className="data-muted">{confirmation.body.action==='discard'?'仅移除服务器上的临时下载文件，不删除业务记录。':'任务会先检查可用空间，并在维护期间暂停写入；不会删除任何业务记录。'}</p>}<label>请输入“{confirmation.phrase}”确认<input autoFocus value={phrase} onChange={e=>setPhrase(e.target.value)}/></label><div className="data-actions"><button disabled={busy} onClick={()=>setConfirmation(null)}>取消</button><button className="data-danger" disabled={disabled||phrase!==confirmation.phrase||Boolean(confirmation.preview&&!ack)||Boolean(confirmation.preview?.daysWithoutReports.length&&!ackMissing)} onClick={async()=>{const ok=await submit({...confirmation.body,confirmation:phrase,ackDownloaded:confirmation.download&&ack,ackMissingReports:ackMissing});if(ok)setConfirmation(null);}}>确认执行</button></div></section></div>:null}
 </main>;
}

