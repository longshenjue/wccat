"use client";
import {useEffect,useRef,useState} from 'react';
import {browseUrl,useAdminRead,chinaTime} from './admin-query';
import {trendGeometry} from '@/lib/trend-geometry';
import type {TopicTrend as TrendData,TrendPoint} from '@/lib/admin-browse-types';

export function TopicTrend({snapshot,version,itemKey,date,days,onDays,onSample}:{snapshot:string;version:string;itemKey:string;date:string;days:string;onDays:(days:string)=>void;onSample:(point:TrendPoint)=>void}) {
 const {data,error,loading}=useAdminRead<TrendData>(browseUrl('trend',{snapshot,version,key:itemKey,date,days}));
 const [selected,setSelected]=useState<string>();
 const active=data?.points.find(point=>point.snapshotDate===selected)??data?.points.filter(point=>point.status==='matched').at(-1);
 const points=data?.points.filter(point=>point.status==='matched')??[];
 return <section className="admin-trend" aria-label="话题热度变化">
  <header><h3>热度变化</h3><div className="data-actions">{[['1','当天'],['7','近7天'],['30','近30天']].map(([value,label])=><button key={value} aria-pressed={days===value} onClick={()=>onDays(value)}>{label}</button>)}</div></header>
  <p className="data-muted">同标题记录 · 北京时间 UTC+8 · 仅查询已有采样</p>
  {loading?<p role="status">正在读取趋势…</p>:error?<p role="alert" className="data-error">{error}</p>:!data||!points.length?<p>该范围没有可匹配的采样记录。</p>:<>
   <div className="admin-trend-facts"><span>峰值热度 <b>{Math.max(...points.map(point=>point.heatScore!))}</b></span><span>最佳排名 <b>#{Math.min(...points.map(point=>point.rank!))}</b></span><span>有效观测 <b>{points.length} 次</b></span></div>
   <TrendChart data={data} metric="heatScore" selected={active?.snapshotDate} onSelect={point=>setSelected(point.snapshotDate)}/>
   <TrendChart data={data} metric="rank" selected={active?.snapshotDate} onSelect={point=>setSelected(point.snapshotDate)}/>
   {active?<div className="admin-selected-point" aria-live="polite"><b>{active.snapshotDate.slice(0,10)} {active.snapshotDate.slice(11)}:00</b><p>{active.status==='matched'?`综合热度 ${active.heatScore} · 排名 #${active.rank} · 来源 ${active.sourceCount}`:'本次采样未匹配此话题'}</p><small>实际保存：{chinaTime(active.generatedAt)}</small><button onClick={()=>onSample(active)}>查看这次采样</button></div>:null}
   <p className="data-muted">点选采样，或用左右方向键切换。连线辅助观察相邻采样；虚线表示间隔超过4小时。空缺不补零，标题变体可能另列。</p>
   <details><summary>采样数据表（{data.points.length} 条）</summary><div className="data-month-table"><table><thead><tr><th>采样时段</th><th>热度分</th><th>排名</th><th>状态</th></tr></thead><tbody>{data.points.map(point=><tr key={point.snapshotDate}><td><button onClick={()=>setSelected(point.snapshotDate)}>{point.snapshotDate}</button></td><td>{point.heatScore??'—'}</td><td>{point.rank===null?'—':'#'+point.rank}</td><td>{point.status==='matched'?'已匹配':point.status==='ambiguous'?'匹配有歧义':'未匹配此话题'}</td></tr>)}</tbody></table></div></details>
  </>}
 </section>;
}
function TrendChart({data,metric,selected,onSelect}:{data:TrendData;metric:'heatScore'|'rank';selected?:string;onSelect:(point:TrendPoint)=>void}) {
 const container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(500);
 useEffect(()=>{
  const node=container.current;if(!node)return;
  const observer=new ResizeObserver(entries=>setWidth(Math.max(260,Math.floor(entries[0].contentRect.width))));observer.observe(node);return()=>observer.disconnect();
 },[]);
 const shape=trendGeometry(data.points,metric,width,data.date,data.days),rank=metric==='rank';
 const color=rank?'#fb719c':'#73b7ff';
 return <div ref={container} className="admin-trend-chart"><h4>{rank?'榜单排名 · #1 在上方':'综合热度分 · 非浏览量'}</h4><svg viewBox={`0 0 ${width} ${shape.height}`} width="100%" height={shape.height} role="group" aria-label={rank?'排名变化图':'综合热度变化图'}>
  {shape.ticks.map(tick=><g key={tick.value}><line x1={shape.left} x2={width-shape.right} y1={tick.y} y2={tick.y} stroke="#31415b" strokeDasharray="3 5"/><text x={shape.left-8} y={tick.y+4} textAnchor="end" fill="#a3b3d0" fontSize="11">{rank?'#':''}{tick.value}</text></g>)}
  {shape.timeTicks.map((tick,index)=><text key={tick.time} x={tick.x} y="171" textAnchor={index===0?'start':index===shape.timeTicks.length-1?'end':'middle'} fill="#a3b3d0" fontSize="10">{data.days===1&&index===shape.timeTicks.length-1?'24:00':new Date(tick.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',...(data.days>1?{month:'numeric' as const,day:'numeric' as const}:{hour:'2-digit' as const,minute:'2-digit' as const,hour12:false})})}</text>)}
  {shape.segments.map((line,index)=><line key={index} {...{x1:line.x1,x2:line.x2,y1:line.y1,y2:line.y2}} stroke={color} strokeWidth="2" strokeDasharray={line.dashed?'4 5':undefined}/>)}
  {shape.dots.map((dot,index)=><g key={dot.point.snapshotDate} role="button" tabIndex={selected===dot.point.snapshotDate||(!shape.dots.some(value=>value.point.snapshotDate===selected)&&index===shape.dots.length-1)?0:-1} aria-pressed={selected===dot.point.snapshotDate} aria-label={`${dot.point.snapshotDate} ${rank?'排名':'热度'} ${dot.point[metric]}`} onFocus={()=>onSelect(dot.point)} onClick={()=>onSelect(dot.point)} onKeyDown={event=>{
   if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(dot.point);}
   if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?shape.dots.length-1:Math.max(0,Math.min(shape.dots.length-1,index+(event.key==='ArrowRight'?1:-1)));
    onSelect(shape.dots[next].point);(event.currentTarget.parentElement?.querySelectorAll<SVGGElement>('.admin-chart-point')[next])?.focus();
   }
  }} className="admin-chart-point"><circle cx={dot.x} cy={dot.y} r="12" fill="transparent"/><circle cx={dot.x} cy={dot.y} r={selected===dot.point.snapshotDate?6:3.5} fill={color} stroke={selected===dot.point.snapshotDate?'#fff':'#0b1427'} strokeWidth="2"/></g>)}
 </svg></div>;
}
