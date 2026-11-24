"use client";
import {useEffect,useState} from 'react';
import type {TopicShareCandidate,TopicShareRef} from '../../lib/topic-sharing/types';
import {EDITORIAL_COLUMNS} from '../../lib/topic-sharing/columns';
import {useAdminQuery} from '../admin-query';
import {TopicShareEditor} from './topic-share-editor';

type Recommendations={english:TopicShareCandidate[];chinese:TopicShareCandidate[];cadence?:{dailyImages:number;storiesMin:number;storiesMax:number}};

/** Pure view also supports static rendering and never requests generation. */
export function TopicShareRecommendationsView({english,chinese,onSelect}:Recommendations&{onSelect:(ref:TopicShareRef)=>void}) {
 return <div className="topic-recommendation-grid">{(['english','chinese'] as const).map(language=><section key={language} className="topic-recommendation-column" aria-label={language==='english'?'English picks':'中文推荐'}><h4>{language==='english'?'English picks':'中文推荐'}</h4><p className="topic-small">{language==='english'?'Context for readers new to the story.':'从具体事件与实际影响切入。'}</p><ol>{(language==='english'?english:chinese).map((candidate,index)=>{
  const reasoning=candidate.recommendation[language],column=EDITORIAL_COLUMNS.find(item=>item.id===candidate.recommendation.column);
  return <li key={candidate.id}><div className="topic-recommendation-meta"><span>{String(index+1).padStart(2,'0')} · {candidate.date}</span><b>编辑优先级 {reasoning.score}/100</b></div><h5>{candidate.title}</h5><p className="topic-recommendation-series">{language==='english'?column?.en:column?.zh}</p><p>{reasoning.reason}</p><p className="topic-recommendation-angle"><b>{language==='english'?'Angle':'切入点'}：</b>{reasoning.angle}</p>{candidate.recommendation.warnings.length?<details><summary>材料限制</summary><ul>{candidate.recommendation.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>:null}<button type="button" onClick={()=>onSelect(candidate.ref)}>制作单话题分享 →</button></li>;
 })}</ol>{!(language==='english'?english:chinese).length?<p className="topic-empty">这两天还没有可推荐的已保存话题。请先检查小时采样或日报。</p>:null}</section>)}</div>;
}

export function TopicShareRecommendations({date}:{date:string}) {
 const {params,change}=useAdminQuery(),recordId=params.get('topicShare')??undefined;
 const [view,setView]=useState<{date:string;data?:Recommendations;error?:string}>({date:''});
 const [selected,setSelected]=useState<TopicShareRef>();
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/admin/topic-share?action=recommendations&date=${encodeURIComponent(date)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error??'读取编辑推荐失败。');return data as Recommendations;
  }).then(data=>{if(!controller.signal.aborted)setView({date,data});}).catch(error=>{if(!controller.signal.aborted)setView({date,error:error instanceof Error?error.message:'读取推荐失败。'});});
  return ()=>controller.abort();
 },[date]);
 const current=view.date===date?view:undefined;
 return <section className="topic-sharing-recommendations" aria-label="双语编辑推荐"><header><p className="topic-eyebrow">THE EDITORIAL DESK</p><h3>今天与昨天，哪些话题值得讲清楚</h3><p>英文日报 {current?.data?.cadence?.dailyImages??4} 张图 + 每天 {current?.data?.cadence?.storiesMin??2}–{current?.data?.cadence?.storiesMax??3} 个单话题。按所选日期和前一天的已保存材料排序；分值仅表示编辑优先级。</p></header>{!current?<p role="status">正在读取双语编辑推荐…</p>:current.error?<p className="data-error" role="alert">{current.error}</p>:current.data?<TopicShareRecommendationsView {...current.data} onSelect={ref=>{setSelected(ref);if(recordId)change({topicShare:null});}}/>:null}{recordId?<TopicShareEditor recordId={recordId} onClose={()=>{setSelected(undefined);change({topicShare:null});}}/>:selected?<TopicShareEditor sourceRef={selected} onClose={()=>setSelected(undefined)}/>:null}</section>;
}
