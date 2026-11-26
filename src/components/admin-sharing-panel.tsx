"use client";

import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import type { WccatDailyReport } from '@/lib/daily-report';
import type { ShareEnBattle, ShareEnCopy, SharingFormat } from '@/lib/shareen-types';
import { getDailyShareCopy, type ShareLanguage } from '@/lib/daily-share-copy';
import { downloadBlob, fitShareEnCard, nextPaint, shareEnTextFiles, bilingualDailyTextFiles, dailyCardFilename, waitForPosterImages, inlinePosterImages } from '@/lib/share-export';
import { reconcileSharingDraft, updateShareEnTop3, type SharingDraft } from '@/lib/client-share-draft';
import {buildChineseDailyCards} from '@/lib/daily-bilingual-cards';
import { getShareEnBattle,normaliseShareEnBattle } from '@/lib/shareen-battle';
import { validateShareEnStructure } from '@/lib/shareen-validation';
import { DailySharePoster } from './daily-share-poster';
import { ScaledPoster, ShareEnPoster, ShareEnPreviewCard, shareEnCardIdentity } from './shareen-poster';
import './shareen.css';
import {TopicShareRecommendations} from './topic-sharing/topic-share-recommendations';
import './topic-sharing/topic-sharing.css';

type Props = {
 date: string; revision: string; disabled: boolean;
 onDateChange: (date: string)=>void;
 onGenerate: (format: SharingFormat, force: boolean, topicId?: string)=>Promise<boolean>;
 onSaved: ()=>void | Promise<void>;
};
type Tab = 'zh' | 'en' | 'shareen';
type ExportRequest = {kind:'long';language:ShareLanguage} | {kind:'shareen';index?:number;language?:ShareLanguage};

/** Queued work navigates to the task log, so all formats require a saved draft. */
export function sharingGenerationDisabled(busy:boolean,dirty:boolean):boolean {
 return busy||dirty;
}

export function SharingGenerationButton({busy,dirty,disabled,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{busy:boolean;dirty:boolean}) {
 return <button {...props} type="button" disabled={sharingGenerationDisabled(busy,dirty)||disabled}/>;
}

class SharingRequestError extends Error {
 constructor(message:string,readonly status:number){super(message);}
}

async function responseData(response:Response):Promise<{report?:WccatDailyReport;shareEnRevision:string;error?:string}> {
 const data=await response.json();
 if(!response.ok)throw new SharingRequestError(data.error||'分享操作失败，请重试。',response.status);
 if(typeof data.shareEnRevision!=='string'||!data.shareEnRevision)throw new Error('分享版本标识缺失，请刷新后重试。');
 return data;
}

function BattleEditor({report,copy,index,disabled,onChange}:{report:WccatDailyReport;copy:ShareEnCopy;index:number;disabled:boolean;onChange:(battle:ShareEnBattle)=>void}) {
 const stored=copy.highlights[index].battle;
 const editable=stored&&typeof stored==='object'&&typeof stored.redScore==='number'&&typeof stored.blueScore==='number';
 const battle=editable?stored:getShareEnBattle(report,copy,index+1);
 if(!battle)return <p className="data-muted">暂无态度短句，重新生成 ShareEn 时将尝试补齐。</p>;
 return <fieldset className="shareen-battle-editor"><legend>情绪对抗 · 英文短句</legend><p className="data-muted">标签最多显示3词，说明最多8词；已有分析沿用原分值，未有分析时标记 AI estimate。</p>{!normaliseShareEnBattle(battle,report,copy.highlights[index].topicId)?<p className="data-warning">请填写完整英文态度短句；不完整态度将略过，新闻正文仍可保存。</p>:null}<div className="shareen-edit-grid">{([['redLabel','红侧短标签'],['blueLabel','蓝侧短标签'],['redRationale','红侧简短说明'],['blueRationale','蓝侧简短说明']] as const).map(([field,label])=><label key={field}>{label}<input lang="en" value={battle[field]??''} disabled={disabled} onChange={event=>onChange({...battle,[field]:event.target.value})}/></label>)}</div></fieldset>;
}

export function AdminSharingPanel({date,revision,disabled,onDateChange,onGenerate,onSaved}:Props) {
 const key=`${date}:${revision}`;
 const [loaded,setLoaded]=useState<{key:string;report:WccatDailyReport|null;error:string;shareEnRevision:string}>({key:'',report:null,error:'',shareEnRevision:''});
 const [draftState,setDraftState]=useState<SharingDraft>();
 const [tab,setTab]=useState<Tab>('shareen');
 const [cardLanguage,setCardLanguage]=useState<ShareLanguage>('zh');
 const [message,setMessage]=useState('');
 const [saving,setSaving]=useState(false);
 const [generating,setGenerating]=useState(false);
 const [exporting,setExporting]=useState<ExportRequest|null>(null);
 const exportRoot=useRef<HTMLDivElement>(null);
 const latestReport=loaded.key===key?loaded.report:null;
 const activeDraft=draftState?.date===date?draftState:undefined;
 const dirty=Boolean(activeDraft?.dirty);
 const conflict=Boolean(activeDraft?.conflict);
 const report=dirty?activeDraft?.baseReport??null:latestReport;
 const loading=loaded.key!==key;
 const busy=disabled||saving||generating||Boolean(exporting)||loading;
 const generationDisabled=sharingGenerationDisabled(busy,dirty);
 const copy=report?activeDraft?.copy:undefined;
 const selected=copy?.posts.find(post=>post.id===copy.selectedPostId);
 const chinese=useMemo(()=>{
  if(!report||!copy)return {copy:undefined,error:''};
  try{return {copy:buildChineseDailyCards(report,copy),error:''};}
  catch(error){return {copy:undefined,error:error instanceof Error?error.message:'中文卡片暂不可用，请载入同一日报版本。'};}
 },[report,copy]);
 const chinesePost=chinese.copy?.posts[0];
 let longCopy;
 try {longCopy=report&&tab!=='shareen'?getDailyShareCopy(report,tab):undefined;} catch {longCopy=undefined;}

 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/admin/share?date=${encodeURIComponent(date)}`,{cache:'no-store',signal:controller.signal})
   .then(responseData).then(data=>{
    if(controller.signal.aborted)return;
    setLoaded({key,report:data.report??null,error:'',shareEnRevision:data.shareEnRevision});
    setDraftState(previous=>reconcileSharingDraft(previous,date,data.report??null,data.shareEnRevision));
    setMessage('');
   }).catch(error=>{
    if(controller.signal.aborted)return;
    setLoaded({key,report:null,error:error instanceof Error?error.message:'读取日报失败。',shareEnRevision:''});
   });
  return ()=>controller.abort();
 },[date,key]);

 function edit(update:(previous:ShareEnCopy)=>ShareEnCopy) {
  setDraftState(previous=>previous?.copy?{...previous,copy:update(previous.copy),dirty:true}:previous);setMessage('');
 }
 async function generate(format:SharingFormat,force:boolean,topicId?:string) {
  if(!report)return;
  if(generationDisabled){if(dirty)setMessage('请先保存编辑，再生成分享内容或处理配图。');return;}
  setGenerating(true);setMessage('');
  try {if(await onGenerate(format,force,topicId))setMessage('生成任务已加入队列，可在任务记录查看进度和日志。');}
  catch(error){setMessage(error instanceof Error?error.message:'创建生成任务失败。');}
  finally{setGenerating(false);}
 }
 async function save() {
  if(!copy||busy||conflict)return;
  setSaving(true);setMessage('');
  try {
   const data=await responseData(await fetch('/api/admin/share',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',date,copy,expectedRevision:activeDraft?.expectedRevision}),cache:'no-store'}));
   if(data.report){
    setLoaded({key,report:data.report,error:'',shareEnRevision:data.shareEnRevision});
    setDraftState({date,copy:data.report.shareEn,baseReport:data.report,dirty:false,conflict:false,expectedRevision:data.shareEnRevision});
   }
   setMessage('配文与卡片编辑已保存。');
   await onSaved();
  }catch(error){
   if(error instanceof SharingRequestError&&error.status===409)setDraftState(previous=>previous?{...previous,conflict:true}:previous);
   setMessage(error instanceof Error?error.message:'保存失败。');
  }
  finally{setSaving(false);}
 }
 async function reloadDraft() {
  if(busy)return;
  setSaving(true);
  try {
   const data=await responseData(await fetch(`/api/admin/share?date=${encodeURIComponent(date)}`,{cache:'no-store'}));
   setLoaded({key,report:data.report??null,error:'',shareEnRevision:data.shareEnRevision});
   setDraftState({date,copy:data.report?.shareEn,baseReport:data.report??null,dirty:false,conflict:false,expectedRevision:data.shareEnRevision});
   setMessage('已放弃本地编辑并载入最新保存版本。');
  }catch(error){setMessage(error instanceof Error?error.message:'读取最新版本失败，本地编辑已保留。');}
  finally{setSaving(false);}
 }
 async function copyPost(language:ShareLanguage='en') {
  if(language==='zh'){
   if(!chinesePost)return;
   try{await navigator.clipboard.writeText(chinesePost.text);setMessage('中文配文已复制。');}
   catch{setMessage('复制失败，请使用中文配文 TXT。');}
   return;
  }
  if(!selected||!copy||!report)return;
  try {
   const checked=validateShareEnStructure(copy,report);
   const post=checked.posts.find(post=>post.id===checked.selectedPostId);
   if(!post)throw new Error('请先选择有效的英文配文。');
   await navigator.clipboard.writeText(post.text);setMessage('英文配文已复制。');
  }catch(error){setMessage(error instanceof Error?error.message:'复制失败，请核对英文配文后重试。');}
 }
 async function download(request:ExportRequest) {
  if(busy||!report)return;
  setMessage('');
  try {
   const checkedCopy=request.kind==='shareen'&&copy?validateShareEnStructure(copy,report):undefined;
   if(request.kind==='shareen'&&!checkedCopy)throw new Error('尚无 ShareEn 文案。');
   if(checkedCopy&&request.kind==='shareen'&&(request.index===undefined||request.language==='zh'))buildChineseDailyCards(report,checkedCopy);
   setExporting(request);
   await nextPaint();
   const root=exportRoot.current;
   if(!root)throw new Error('导出画布尚未准备好，请重试。');
   const {toBlob}=await import('html-to-image');
   if(request.kind==='long') {
    const poster=root.querySelector<HTMLElement>('.share-poster');
    if(!poster)throw new Error('长图内容尚未准备好。');
    await Promise.all([...poster.querySelectorAll('img')].map(image=>{
     if(image.complete)return Promise.resolve();
     return Promise.race([image.decode().catch(()=>undefined),new Promise<void>(resolve=>window.setTimeout(resolve,8000))]);
    }));
    const height=poster.scrollHeight;
    const blob=await toBlob(poster,{width:poster.offsetWidth,height,pixelRatio:Math.min(1.5,8192/height),backgroundColor:'#080d1d',skipFonts:true,includeQueryParams:true,filter:node=>!(node instanceof HTMLImageElement)||Boolean(node.complete&&node.naturalWidth),fetchRequestInit:{signal:AbortSignal.timeout(10000)}});
    if(!blob)throw new Error('长图导出失败。');
    downloadBlob(blob,`WcCAT-${date}-${request.language}.png`);
   } else {
    if(!checkedCopy)throw new Error('尚无 ShareEn 文案。');
    const cards=[...root.querySelectorAll<HTMLElement>('.shareen-card')];
    const expected=request.index===undefined?(checkedCopy.highlights.length+1)*2:1;
    if(cards.length!==expected)throw new Error('卡片画布不完整，请重试。');
    const missing=await waitForPosterImages(root);
    await nextPaint();
    const unavailable=missing+await inlinePosterImages(root);
    await nextPaint();
    if(unavailable)setMessage(`有 ${unavailable} 张配图无法加载，已收起图片区并保留文字与情绪条。`);
    // Validate the whole package before rendering any PNG.
    for(const card of cards)fitShareEnCard(card,shareEnCardIdentity(report,checkedCopy,Number(card.dataset.shareenIndex),card.dataset.shareenLanguage==='zh'?'zh':'en'));
    const files=[];
    for(const card of cards) {
     const index=Number(card.dataset.shareenIndex);
     const blob=await toBlob(card,{width:1200,height:card.offsetHeight,pixelRatio:1,backgroundColor:'#ffffff',skipFonts:true,includeQueryParams:true,filter:node=>!(node instanceof HTMLImageElement)||Boolean(node.complete&&node.naturalWidth),fetchRequestInit:{signal:AbortSignal.timeout(10000)}});
     if(!blob)throw new Error(`卡片 ${String(index+1).padStart(2,'0')} 导出失败。`);
     const name=dailyCardFilename(index,card.dataset.shareenLanguage==='zh'?'zh':'en');
     if(request.index!==undefined)downloadBlob(blob,`WcCAT-ShareEn-${date}-${name}`);
     else files.push({name,data:new Uint8Array(await blob.arrayBuffer())});
    }
    if(request.index===undefined) {
     const {createStoreZip}=await import('@/lib/client-zip');
     const zip=createStoreZip([...files,...bilingualDailyTextFiles(report,checkedCopy)]);
     downloadBlob(new Blob([zip],{type:'application/zip'}),`WcCAT-Daily-${date}-en-zh.zip`);
    }
   }
   setMessage('下载已准备好。');
  }catch(error){setMessage(error instanceof Error?error.message:'导出失败，请稍后重试。');}
  finally{setExporting(null);}
 }
 function downloadText(name:string,language:ShareLanguage='en') {
  if(!copy||!report)return;
  try {
   const checked=validateShareEnStructure(copy,report);
   const file=shareEnTextFiles(report,checked,language).find(file=>file.name===name);
   if(file)downloadBlob(new Blob([new TextDecoder().decode(file.data)],{type:'text/plain;charset=utf-8'}),`WcCAT-ShareEn-${date}-${language==='zh'?'zh-':''}${name}`);
  }catch(error){setMessage(error instanceof Error?error.message:'文本导出失败。');}
 }

 return <section className="data-card admin-sharing" aria-label="分享制作">
  <div className="admin-sharing-header"><div><h2>分享制作</h2><p className="data-muted">选择日报，预览与下载已保存版本。AI 生成、重新生成和文案编辑分别操作。</p></div><label>日报日期<input type="date" value={date} disabled={busy} onChange={event=>{if(event.target.value)onDateChange(event.target.value);}}/></label></div>
  <TopicShareRecommendations date={date}/>
  {loading?<p role="status">正在读取日报与分享版本…</p>:null}
  {loaded.key===key&&loaded.error?<p className="data-error" role="alert">{loaded.error}</p>:null}
  {!loading&&!loaded.error&&!report?<p className="admin-sharing-empty">该日期还没有日报，请先在「日报生成」中生成。</p>:null}
  {report?<>
   <div className="admin-sharing-status"><span className="data-badge ready">中文已就绪</span><span className={`data-badge ${report.shareEnglish?'ready':'partial'}`}>English {report.shareEnglish?'已就绪':'待生成'}</span><span className={`data-badge ${report.shareEn?'ready':'partial'}`}>ShareEn {report.shareEn?'文案已保存':'待生成'}</span></div>
   <div className="admin-sharing-actions"><SharingGenerationButton busy={busy} dirty={dirty} onClick={()=>generate('all',false)}>补齐 English / ShareEn</SharingGenerationButton>{report.shareEnglish||report.shareEn?<SharingGenerationButton busy={busy} dirty={dirty} onClick={()=>generate('all',true)}>重新生成 English + ShareEn · AI</SharingGenerationButton>:null}</div>
   <div className="admin-sharing-tabs" role="tablist" aria-label="分享格式">{([['shareen','中英双语 · 多图'],['zh','中文长图 · 旧版'],['en','English 长图 · 旧版']] as const).map(([id,label])=><button type="button" key={id} role="tab" id={`sharing-tab-${id}`} aria-selected={tab===id} aria-controls="sharing-format-content" disabled={Boolean(exporting)} onClick={()=>{setTab(id);setMessage('');}}>{label}</button>)}</div>
   <div className="admin-sharing-workspace" id="sharing-format-content" role="tabpanel" aria-labelledby={`sharing-tab-${tab}`}>
    {tab!=='shareen'?<>
     {tab==='zh'?<p className="data-muted">中文长图使用已保存日报，每次下载即时渲染。<Link href={'/admin?tab=daily&dDate='+encodeURIComponent(date)}>修改内容或重新生成中文日报 →</Link></p>:null}
     <div className="admin-sharing-actions">{tab==='en'?<SharingGenerationButton busy={busy} dirty={dirty} onClick={()=>generate('english',Boolean(report.shareEnglish))}>{report.shareEnglish?'重新生成 English · AI':'生成 English · AI'}</SharingGenerationButton>:null}<button type="button" disabled={busy||!longCopy} onClick={()=>download({kind:'long',language:tab})}>{exporting?'正在导出…':'↓ 下载长图 PNG'}</button></div>
     {longCopy?<div className="admin-long-preview"><ScaledPoster width={1600}><DailySharePoster report={report} copy={longCopy} language={tab}/></ScaledPoster></div>:<p className="admin-sharing-empty">English 尚未生成，点击生成按钮后等待后台任务完成。</p>}
    </>:<>
     <div className="admin-sharing-actions"><SharingGenerationButton busy={busy} dirty={dirty} onClick={()=>generate('shareen',Boolean(report.shareEn))}>{report.shareEn?'重新生成 ShareEn · AI':'生成 ShareEn · AI'}</SharingGenerationButton><SharingGenerationButton busy={busy} dirty={dirty} disabled={!copy} onClick={()=>generate('images',false)}>补齐配图</SharingGenerationButton><button type="button" className="data-primary" disabled={busy||!copy} onClick={()=>download({kind:'shareen'})}>{exporting?'正在导出…':'↓ 下载中英双语 ZIP'}</button></div>
     {copy?<>
      <p className="data-muted">1200 × 1500 起（有热评或完整长文时按内容增高）· 完整 Top {copy.overview.topics.length} 总览 + {copy.highlights.length} 张精选详情图 · 通栏 1072 × 360 / 完整分栏 400 × 480 · 中英文分别发帖，每版使用各自的卡片与配文。两版同步复用同一日榜与精选话题，中文完整使用已保存日报，不额外调用 AI。ZIP 包含 en- / zh- 命名的两套有序 PNG、各自配文、Alt text、来源与统计窗口。</p>
      {dirty?<p className="shareen-unsaved">有未保存编辑。预览与下载使用当前编辑稿；点击保存后写入日报。请先保存编辑，再生成分享内容或处理配图。</p>:null}
      {conflict?<div className="data-warning" role="alert"><p>服务器上的日报或 ShareEn 已更新。本地编辑已保留；当前预览仍对应编辑时的日报。请先下载或复制需要保留的内容，再载入最新版本后编辑。</p><button type="button" disabled={busy} onClick={reloadDraft}>放弃本地编辑，载入最新版本</button></div>:null}
      <div className="admin-sharing-actions shareen-language-switch" role="group" aria-label="多图预览语言">{([['zh','中文'],['en','English']] as const).map(([language,label])=><button key={language} type="button" aria-pressed={cardLanguage===language} disabled={Boolean(exporting)} onClick={()=>{setCardLanguage(language);setMessage('');}}>{label}</button>)}</div>
      {cardLanguage==='zh'&&chinese.error?<p className="data-warning" role="alert">{chinese.error} 可切换 English 预览并单独下载已有英文卡片。</p>:<div className="shareen-preview-grid">{Array.from({length:copy.highlights.length+1},(_,index)=><ShareEnPreviewCard key={`${cardLanguage}-${index}`} report={report} copy={copy} language={cardLanguage} index={index} disabled={busy} processingDisabled={generationDisabled} onReprocess={index>0?()=>generate('images',true,copy.highlights[index-1].topicId):undefined} onDownload={()=>download({kind:'shareen',index,language:cardLanguage})}/>)}</div>}
      {cardLanguage==='zh'&&chinesePost?<section className="shareen-editor"><h3>中文配文</h3><p className="data-muted">与英文精选话题顺序一致，使用已保存中文日报中的完整内容。英文编辑与配图设置仍在下方。</p><textarea lang="zh" aria-label="中文配文" value={chinesePost.text} readOnly rows={8}/><div className="admin-sharing-actions"><button type="button" disabled={busy} onClick={()=>copyPost('zh')}>复制中文配文</button><button type="button" disabled={busy} onClick={()=>downloadText('post.txt','zh')}>↓ 中文配文 TXT</button><button type="button" disabled={busy} onClick={()=>downloadText('alt-text.txt','zh')}>↓ 中文 Alt text TXT</button></div></section>:null}
      <section className="shareen-editor"><h3>英文配文</h3><p className="data-muted">候选切换、手动编辑和保存均不会调用 AI。{copy.layout==='editorial'?'首句直接进入发现；品牌信息在末尾；编号摘要对应焦点卡。':<>首行保留 WcCAT Daily Hot，{copy.captionBasis==='highlights'?'编号内容按焦点卡顺序介绍对应话题。':'此旧稿编号内容对应原始日榜 TOP1 / TOP2 / TOP3；重新生成 ShareEn 后将与焦点卡同步。'}</>}</p>
       <div className="shareen-edit-grid">{copy.top3.map((topic,index)=><label key={topic.topicId}>{copy.captionBasis==='highlights'?`焦点 ${index+1} · 原榜 #${report.topics.find(t=>t.id===topic.topicId)?.rank??'?'}`:`原始 TOP${index+1}`} · 英文摘要<input lang="en" value={topic.summary} disabled={busy} onChange={event=>edit(previous=>updateShareEnTop3(previous,index,event.target.value))}/></label>)}</div><p className="data-muted">修改摘要会同步更新全部候选中的对应编号条目。{copy.layout==='editorial'?'直接编辑配文时，首句直接进入发现，末尾保留品牌和来源说明，并保留完整焦点编号条目。':'直接编辑配文时仍需保留品牌首行与完整编号条目。'}</p>
       <label>配文候选<select value={copy.selectedPostId} disabled={busy} onChange={event=>edit(previous=>({...previous,selectedPostId:event.target.value}))}>{copy.posts.map((post,index)=><option value={post.id} key={post.id}>{index+1}. {post.template}</option>)}</select></label>
       {selected?<><p className="shareen-post-reason">推荐理由：{selected.reason}</p><label>所选英文配文<textarea lang="en" value={selected.text} disabled={busy} rows={9} onChange={event=>edit(previous=>({...previous,posts:previous.posts.map(post=>post.id===previous.selectedPostId?{...post,text:event.target.value}:post)}))}/></label></>:null}
       <div className="admin-sharing-actions"><button type="button" disabled={busy||!selected} onClick={()=>copyPost()}>复制配文</button><button type="button" disabled={busy||!selected} onClick={()=>downloadText('post.txt')}>↓ 配文 TXT</button><button type="button" disabled={busy} onClick={()=>downloadText('alt-text.txt')}>↓ Alt text TXT</button><button type="button" className="data-primary" disabled={busy||!dirty||conflict} onClick={save}>{saving?'正在保存…':'保存编辑'}</button></div>
       <details><summary>编辑卡片短文与 Alt text</summary><p className="data-muted">首图按原榜顺序展示全部日榜短标题，用颜色与箭头标出有详情图的条目。修改下方英文短标题会同步更新总览；精选详情图保留栏目、完整配图、事件说明、情绪对抗和相关性。超长卡片会指出具体页码，缩短文案后可下载。</p><div className="shareen-edit-grid">
        {copy.overview.topics.map((topic,index)=><label key={topic.id}>日榜 {index+1} · 英文短标题<input value={topic.title} disabled={busy} onChange={event=>edit(previous=>({...previous,overview:{...previous.overview,topics:previous.overview.topics.map(item=>item.id===topic.id?{...item,title:event.target.value}:item)}}))}/></label>)}
        {copy.highlights.map((highlight,index)=><div className="shareen-edit-wide" key={highlight.topicId}><h4>{shareEnCardIdentity(report,copy,index+1)}</h4><label className="data-check"><input type="checkbox" checked={highlight.hideImage??false} disabled={busy} onChange={event=>edit(previous=>({...previous,highlights:previous.highlights.map(item=>item.topicId===highlight.topicId?{...item,hideImage:event.target.checked}:item)}))}/>隐藏配图，使用纯文字布局</label><label>配图 URL（留空使用原话题封面）<input type="url" placeholder="https://…" value={highlight.imageUrl??''} disabled={busy} onChange={event=>edit(previous=>({...previous,highlights:previous.highlights.map(item=>item.topicId===highlight.topicId?{...item,imageUrl:event.target.value,imageAsset:undefined}:item)}))}/></label><p className="data-muted">使用现有图片代理支持的来源域名；修改来源会清除旧配图引用。保存后可重新处理该图；缺图或加载失败会收起图片区并恢复全文宽度，情绪条仍保留。</p><div className="shareen-edit-grid">{([['hook','标题'],['whatHappened','What happened'],['whyItMatters','Why it matters']] as const).map(([field,label])=><label key={field}>{label}<textarea value={highlight[field]} disabled={busy} onChange={event=>edit(previous=>({...previous,highlights:previous.highlights.map(item=>item.topicId===highlight.topicId?{...item,[field]:event.target.value}:item)}))}/></label>)}</div><BattleEditor report={report} copy={copy} index={index} disabled={busy} onChange={battle=>edit(previous=>({...previous,highlights:previous.highlights.map(item=>item.topicId===highlight.topicId?{...item,battle}:item)}))}/></div>)}
        {copy.altTexts.map((text,index)=><label key={index}>卡片 {String(index+1).padStart(2,'0')} · Alt text<textarea value={text} disabled={busy} onChange={event=>edit(previous=>({...previous,altTexts:previous.altTexts.map((item,i)=>i===index?event.target.value:item)}))}/></label>)}
       </div><button type="button" disabled={busy||!dirty||conflict} onClick={save}>保存卡片与配文</button></details>
      </section>
     </>:<p className="admin-sharing-empty">尚无 ShareEn。点击生成按钮创建后台任务；材料支持的话题会形成对应详情卡，最多精选三个，不补造内容。</p>}
    </>}
   </div>
  </>:null}
  {message?<p className="daily-share-message" role="status">{message}</p>:null}
  {exporting&&report?createPortal(<div className="shareen-render-root" ref={exportRoot} aria-hidden="true">{exporting.kind==='long'?<DailySharePoster report={report} copy={getDailyShareCopy(report,exporting.language)} language={exporting.language}/>:copy?(exporting.index===undefined?(['en','zh'] as const).flatMap(language=>Array.from({length:copy.highlights.length+1},(_,index)=><ShareEnPoster key={`${language}-${index}`} report={report} copy={copy} index={index} language={language}/>)):<ShareEnPoster report={report} copy={copy} index={exporting.index} language={exporting.language??'en'}/>):null}</div>,document.body):null}
 </section>;
}
