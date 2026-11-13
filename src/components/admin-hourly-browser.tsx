"use client";
import {getChinaDate} from '@/lib/date';
import {browseUrl,chinaTime,useAdminQuery,useAdminRead} from './admin-query';
import {AdminItemDetail} from './admin-item-detail';
import type {HourlyBrowseResult} from '@/lib/admin-browse-types';

export function AdminHourlyBrowser() {
 const {params,change}=useAdminQuery(),date=params.get('hDate')??getChinaDate();
 const selected=params.get('hSnapshot')??undefined,kind=params.get('hKind')??'topics',page=params.get('hPage')??'1';
 const item=params.get('hItem'),version=params.get('hVersion'),days=params.get('trendDays')??'1';
 const search=params.get('hQuery')??'',source=params.get('hSource')??'';
 const {data,error,loading}=useAdminRead<HourlyBrowseResult>(browseUrl('hourly',{date,snapshot:selected,kind,page,search,source,version:params.get('hListVersion')??undefined}));
 const clear={hItem:null,hVersion:null,hListVersion:null};
 return <section className="admin-browser" aria-label="小时报历史查询">
  <section className="data-card"><p className="eyebrow">HOURLY HISTORY</p><h2>小时报记录</h2><p className="data-muted">查看当时保存的聚合话题与平台原始条目。查询不会重新抓取或调用 AI。</p>
   <div className="data-range"><label>小时报日期<input type="date" value={date} onChange={event=>change({hDate:event.target.value,hSnapshot:null,hPage:null,...clear})}/></label><label>采样时段 · 北京时间<select aria-label="采样时段 · 北京时间" value={data?.snapshot?.date??''} disabled={!data?.snapshots.length} onChange={event=>change({hSnapshot:event.target.value,hPage:null,...clear})}>{data?.snapshots.length?data.snapshots.map(snapshot=><option key={snapshot.date} value={snapshot.date}>{snapshot.date.slice(11)}:00 · {snapshot.origin==='main'?'主库':'归档'}</option>):<option value="">当天没有采样</option>}</select></label></div>
   <div className="data-actions" aria-label="条目类型"><button aria-pressed={kind==='topics'} onClick={()=>change({hKind:'topics',hPage:null,...clear})}>聚合话题</button><button aria-pressed={kind==='raw'} onClick={()=>change({hKind:'raw',hPage:null,...clear})}>原始条目</button></div>
   <form key={date+'|'+search+'|'+source+'|'+kind} className="admin-search" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);change({hQuery:String(form.get('search')??''),hSource:String(form.get('source')??''),hPage:null,...clear});}}><label>标题关键词<input name="search" defaultValue={search} maxLength={200} placeholder="搜索已保存的标题"/></label><label>来源<select aria-label="来源" name="source" defaultValue={source}><option value="">全部来源</option>{data?.sources.map(value=><option key={value.id} value={value.id}>{value.name}</option>)}</select></label><button type="submit">查询</button></form>
  </section>
  {loading?<p role="status">正在查询小时报…</p>:error?<section className="data-card"><p role="alert" className="data-error">{error}</p><button onClick={()=>change({hSnapshot:null,hPage:null,...clear})}>重新选择采样</button></section>:data?<div className={item?'admin-browser-grid':'admin-browser-list'}>
   <section className="data-card"><h3>{kind==='topics'?'聚合话题':'原始条目'} · {data.total} 条</h3>{data.snapshot?<p className="data-muted">采样 {data.snapshot.date} · 实际保存 {chinaTime(data.snapshot.generatedAt)}</p>:<p>当天没有可查询的采样记录；尚未采集或已清理的数据不会用其他日期替代。</p>}
    {data.items.length?<div className="admin-records">{data.items.map(record=><article key={record.key} className={item===record.key?'admin-record selected':'admin-record'}><span className="data-badge">#{record.rank}</span><h4>{record.title}</h4><p className="data-muted">{record.sources.join(' / ')} · {kind==='topics'?'综合热度':'原始热度'} {record.heatText??record.heat??'—'}{record.analysisModel?' · '+record.analysisModel:''}</p><button aria-label={'查看详情：'+record.title} onClick={()=>change({hSnapshot:data.snapshot!.date,hItem:record.key,hVersion:data.snapshot!.version,hListVersion:data.snapshot!.version})}>查看详情</button></article>)}</div>:data.snapshot?<p>此筛选条件下没有条目。</p>:null}
    <div className="data-actions admin-pagination"><button disabled={data.page<=1} onClick={()=>change({...clear,hSnapshot:data.snapshot!.date,hPage:String(data.page-1),hListVersion:data.snapshot!.version})}>上一页</button><span>第 {data.page} 页 / 共 {Math.max(1,Math.ceil(data.total/data.limit))} 页</span><button disabled={data.page*data.limit>=data.total} onClick={()=>change({...clear,hSnapshot:data.snapshot!.date,hPage:String(data.page+1),hListVersion:data.snapshot!.version})}>下一页</button></div>
   </section>
   {item&&version&&selected?<AdminItemDetail key={selected+version+item} snapshot={selected} version={version} itemKey={item} date={date} days={days} onDays={value=>change({trendDays:value})} onClose={()=>change({...clear})} onTopic={key=>change({hKind:'topics',hItem:key})} onSample={point=>change({hDate:point.snapshotDate.slice(0,10),hSnapshot:point.snapshotDate,hVersion:point.version,hListVersion:point.version,hItem:point.itemKey??null,hKind:'topics',hPage:null,hQuery:null,hSource:null})}/>:null}
  </div>:null}
 </section>;
}
