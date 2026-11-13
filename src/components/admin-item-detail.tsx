"use client";
import {useEffect,useRef,useState} from 'react';
import {browseUrl,chinaTime,safeArticleHref,useAdminRead} from './admin-query';
import {TopicTrend} from './topic-trend';
import type {ItemDetail,TrendPoint} from '@/lib/admin-browse-types';
import type {TopicGroup,RawHotItem} from '@/lib/types';

export function AdminItemDetail({snapshot,version,itemKey,date,days,onClose,onDays,onTopic,onSample}:{snapshot:string;version:string;itemKey:string;date:string;days:string;onClose:()=>void;onDays:(days:string)=>void;onTopic:(key:string)=>void;onSample:(point:TrendPoint)=>void}) {
 const {data,error,loading}=useAdminRead<ItemDetail>(browseUrl('detail',{snapshot,version,key:itemKey}));
 const [copied,setCopied]=useState('');
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{
  if(!data)return;
  heading.current?.focus({preventScroll:true});
  heading.current?.scrollIntoView({block:'start'});
 },[data]);
 if(loading)return <section className="data-card" role="status">正在读取条目详情…</section>;
 if(error||!data)return <section className="data-card"><p role="alert" className="data-error">{error??'没有此条目'}</p><button onClick={onClose}>重新选择采样</button></section>;
 const topic=data.kind==='topics'?data.item as TopicGroup:undefined,raw=data.kind==='raw'?data.item as RawHotItem:undefined;
 const links=topic?.occurrences??(raw?[raw]:[]);
 async function copy() {try{await navigator.clipboard.writeText(JSON.stringify(data,null,2));setCopied('已复制 JSON');}catch{setCopied('复制失败，可在下方完整 JSON 中手动复制。');}}
 return <section className="data-card admin-item-detail" aria-label="条目详情"><div className="data-actions"><span className="data-badge">{data.kind==='topics'?'聚合话题':'平台原始条目'}</span><button onClick={onClose}>收起详情</button></div><h3 ref={heading} tabIndex={-1}>{data.item.title}</h3>
  <p>采样时段 {snapshot} · {data.snapshot.origin==='main'?'主库':'历史归档'}</p><small>实际保存：{chinaTime(data.snapshot.generatedAt)}</small>
  <p>排名 #{data.item.rank} · {topic?'综合热度 '+topic.heatScore:'原始热度 '+(raw?.heatText??raw?.heatValue??'未保存')}</p>
  {topic?<><p>{topic.summary.oneLine}</p><p className="data-muted">{topic.summary.whyItMatters}</p></>:raw?.description?<p>{raw.description}</p>:null}
  {raw?.stats?<dl className="admin-item-stats">{Object.entries(raw.stats).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value??'—'}</dd></div>)}</dl>:null}
  <div className="data-actions"><button onClick={copy}>复制 JSON</button>{data.linkedTopicKey?<button onClick={()=>onTopic(data.linkedTopicKey!)}>查看关联话题与趋势</button>:null}</div>{copied?<p role="status">{copied}</p>:null}
  {topic?<TopicTrend snapshot={snapshot} version={version} itemKey={itemKey} date={date} days={days} onDays={onDays} onSample={onSample}/>:null}
  <h4>来源与原文</h4><ul className="admin-source-links">{links.map((link,index)=><li key={index}>{safeArticleHref(link.url)?<a href={safeArticleHref(link.url)} target="_blank" rel="noopener noreferrer">{link.sourceName} · {link.title} ↗</a>:<span>{link.sourceName} · 原始链接不可用</span>}</li>)}</ul>
  {data.analysis?<details><summary>已有 AI 分析 · {data.analysis.model}</summary><p>{data.analysis.summary}</p><p className="admin-preserve-text">{data.analysis.detailedContent}</p><p className="admin-preserve-text">{data.analysis.outsiderContext}</p></details>:<p className="data-muted">该版本没有已保存的 AI 分析。</p>}
  <details><summary>完整 JSON</summary><pre className="admin-json">{JSON.stringify(data,null,2)}</pre></details>
 </section>;
}
