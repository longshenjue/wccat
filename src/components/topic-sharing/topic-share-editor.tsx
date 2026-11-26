"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {EditorialColumn,LocalizedTopicShare,TopicShareCopy,TopicShareLanguage,TopicShareRecord,TopicShareRef} from '../../lib/topic-sharing/types';
import {EDITORIAL_COLUMNS} from '../../lib/topic-sharing/columns';
import {eligibleColumns} from '../../lib/topic-sharing/recommendation';
import {reconcileSavedTopicShareData,reloadTopicShareData,updateSelectedTopicSharePost,type TopicShareEditorData as TopicShareData} from '../../lib/topic-sharing/client-state';
import {createTopicShareZip,fitTopicShareCard,topicShareTextFiles,topicSourceHref} from '../../lib/topic-sharing/export';
import {downloadBlob,nextPaint} from '../../lib/share-export';
import {ScaledPoster} from '../shareen-poster';
import {TOPIC_SHARE_WIDTH,TopicSharePoster,topicSharePosterHeight} from './topic-share-poster';
import {prepareTopicShareDraft} from '../../lib/topic-sharing/validation';
import {TopicShareReview} from './topic-share-review';
import {topicShareBaseFingerprint} from '../../lib/topic-sharing/source-identity';

type TopicJob={id:string;status:string;progress?:string;error?:string;result?:{topicSharing?:{id:string}}};
class TopicShareRequestError extends Error {constructor(message:string,readonly status:number){super(message);}}
async function readResponse<T>(response:Response):Promise<T>{
 const data=await response.json();if(!response.ok)throw new TopicShareRequestError(data.error??'分享操作失败，请重试。',response.status);return data as T;
}
const idPath=(id:string)=>`/api/admin/topic-share?id=${encodeURIComponent(id)}`;
const refPath=(ref:TopicShareRef)=>`/api/admin/topic-share?ref=${encodeURIComponent(JSON.stringify(ref))}`;
const postPatternLabels:Record<string,string>={specific_observation:'具体观察',source_voice:'真实原话',number_context:'数字语境',bounded_counterpoint:'证据对照',culture_translation:'文化梗解释',sourced_update:'事件跟进',context:'背景解读',uncertainty:'待核实问题'};
const fields=[['headline','卡片标题'],['hook','开头切入'],['summary','发生了什么'],['context','理解背景'],['whyItMatters','为什么值得关注'],['question','讨论问题'],['altText','图片替代文字 / Alt text']] as const;

type EditorProps=({sourceRef:TopicShareRef;recordId?:string}|{recordId:string;sourceRef?:TopicShareRef})&{onClose?:()=>void;onRecordSaved?:(record:TopicShareRecord)=>void};
export function TopicShareEditor({sourceRef,recordId,onClose,onRecordSaved}:EditorProps) {
 const requestedKey=recordId?idPath(recordId):refPath(sourceRef!);
 const [activeKey,setActiveKey]=useState(requestedKey);
 const [view,setView]=useState<{key:string;data?:TopicShareData;error?:string}>({key:''});
 const [draft,setDraft]=useState<TopicShareCopy>();
 const [dirty,setDirty]=useState(false),[conflict,setConflict]=useState(false);
 const [language,setLanguage]=useState<TopicShareLanguage>('en');
 const [column,setColumn]=useState<EditorialColumn>('inside');
 const [operation,setOperation]=useState<'save'|'reload'|'generate'|'export'|null>(null);
 const [job,setJob]=useState<TopicJob>();
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [exportLanguages,setExportLanguages]=useState<TopicShareLanguage[]>();
 const dialog=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),exportRoot=useRef<HTMLDivElement>(null),previewRoot=useRef<HTMLDivElement>(null);
 const [layoutError,setLayoutError]=useState('');
 const [previewHeight,setPreviewHeight]=useState(1800);
 const current=view.key===activeKey?view:undefined,loaded=current?.data;
 const saved=loaded?.record,source=saved?.source??loaded?.source,generationSource=loaded?.source;
 const sourceChanged=Boolean(saved&&generationSource&&topicShareBaseFingerprint(saved.source)!==topicShareBaseFingerprint(generationSource));
 const loading=!current,busy=loading||Boolean(operation)||Boolean(job);
 const editableRecord=saved&&draft?{...saved,copy:draft}:undefined;
 const local=draft?.[language],selected=local?.posts.find(post=>post.id===local.selectedPostId)??local?.posts[0];
 const reviewWarnings=useMemo(()=>{
  if(!draft||!source)return [];
  try{return prepareTopicShareDraft(draft,source).reviewWarnings;}
  catch{return [{path:'draft',code:'review_unavailable',message:'自动提示暂不可用，当前编辑已保留。'}];}
 },[draft,source]);

 useEffect(()=>{
  const controller=new AbortController();
  void fetch(activeKey,{cache:'no-store',signal:controller.signal}).then(readResponse<TopicShareData>).then(data=>{
   if(controller.signal.aborted)return;
   setView({key:activeKey,data});setDraft(data.record?.copy);setDirty(false);setConflict(false);setColumn(data.record?.copy.column??data.recommendation.column);setMessage('');setError('');
  }).catch(cause=>{if(!controller.signal.aborted)setView({key:activeKey,error:cause instanceof Error?cause.message:'读取话题失败。'});});
  return ()=>controller.abort();
 },[activeKey]);

 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';closeButton.current?.focus();
  return ()=>{document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);

 useEffect(()=>{
  if(!job)return;
  const controller=new AbortController(),jobId=job.id,ref=source!.ref,savedId=saved?.id;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{
   try{
    const result=await fetch('/api/admin/data?jobs=1',{cache:'no-store',signal:controller.signal}).then(readResponse<{jobs:TopicJob[]}>);
    if(controller.signal.aborted)return;
    const next=result.jobs.find(item=>item.id===jobId);
    if(!next)throw new Error('后台任务记录暂不可用，请重新载入稿件查看结果。');
    if(['queued','running'].includes(next.status)){setJob(next);timer=setTimeout(()=>void poll(),2000);return;}
    const resultId=next.result?.topicSharing?.id??savedId;
    const data=await fetch(resultId?idPath(resultId):refPath(ref),{cache:'no-store',signal:controller.signal}).then(readResponse<TopicShareData>);
    if(controller.signal.aborted)return;
    setView({key:activeKey,data});setDraft(data.record?.copy);setDirty(false);setConflict(false);setColumn(data.record?.copy.column??data.recommendation.column);setJob(undefined);
    if(['complete','ready'].includes(next.status)&&data.record){setMessage('双语稿件已生成并保存，可以编辑或下载。');setError('');}
    else setError(next.error??(next.status==='partial'?'生成任务部分完成，请检查稿件与任务日志。':`生成任务已${next.status==='cancelled'?'取消':'结束但未成功'}，请检查任务日志后重试。`));
   }catch(cause){if(!controller.signal.aborted){setJob(undefined);setError(cause instanceof Error?cause.message:'读取任务进度失败，后台任务可能仍在运行。');}}
  };
  void poll();
  return ()=>{controller.abort();if(timer)clearTimeout(timer);};
 // The job id owns the polling lifecycle; status updates must not restart it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[job?.id,activeKey]);

 const previewKey=editableRecord?JSON.stringify([editableRecord,language]):'';
 useEffect(()=>{
  let active=true;
  const check=()=>{
   const card=previewRoot.current?.querySelector<HTMLElement>('.topic-share-card');if(!card||!active)return;
   try{fitTopicShareCard(card,language.toUpperCase());setPreviewHeight(card.offsetHeight);setLayoutError('');}catch(cause){setLayoutError(cause instanceof Error?cause.message:'预览文案超出卡片。');}
  };
  void document.fonts.ready.then(check);
  return ()=>{active=false;};
 },[previewKey,language]);

 function askToDiscard(){return !dirty||window.confirm('当前中英文编辑尚未保存。确定放弃这些修改吗？');}
 function close(){if(askToDiscard())onClose?.();}
 function edit(update:(copy:LocalizedTopicShare)=>LocalizedTopicShare){setDraft(previous=>previous?{...previous,[language]:update(previous[language])}:previous);setDirty(true);setMessage('');setError('');}
 function apply(data:TopicShareData,mode:'saved'|'reloaded'='saved'){setView(previous=>({key:activeKey,data:mode==='reloaded'?data:reconcileSavedTopicShareData(previous.key===activeKey?previous.data:undefined,data)}));setDraft(data.record?.copy);setDirty(false);setConflict(false);setColumn(data.record?.copy.column??data.recommendation.column);}
 async function reload(){
  if(busy||!askToDiscard())return;
  setOperation('reload');setError('');
  try{
   const liveRef=generationSource?.ref??source?.ref;
   const data=await reloadTopicShareData(loaded,{live:()=>fetch(liveRef?refPath(liveRef):activeKey,{cache:'no-store'}).then(readResponse<TopicShareData>),frozen:saved?()=>fetch(idPath(saved.id),{cache:'no-store'}).then(readResponse<TopicShareData>):undefined});
   apply(data,'reloaded');setMessage('已重新核对源材料并载入最新保存版本；原来源已清理时使用冻结稿。');
  }
  catch(cause){setError(cause instanceof Error?cause.message:'读取失败，本地编辑已保留。');}
  finally{setOperation(null);}
 }
 async function generate(){
  if(busy||dirty||!source)return;
  setOperation('generate');setMessage('');setError('');
  try{
   const result=await fetch('/api/admin/topic-share',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({action:'generate',ref:generationSource?.ref??source.ref,expectedSourceFingerprint:(generationSource??source).fingerprint,column,force:Boolean(saved),expectedRevision:saved?.revision??'none'})}).then(readResponse<{job:TopicJob}>);
   if(!result.job?.id)throw new Error('生成任务标识缺失，请检查任务记录。');
   setJob(result.job);setMessage('AI 生成已加入后台任务；完成后自动载入保存稿。');
  }catch(cause){if(cause instanceof TopicShareRequestError&&cause.status===409)setConflict(true);setError(cause instanceof Error?cause.message:'创建任务失败。');}
  finally{setOperation(null);}
 }
 async function save(){
  if(busy||!saved||!draft||!dirty||conflict)return;
  setOperation('save');setError('');setMessage('');
  try{
   const data=await fetch('/api/admin/topic-share',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({action:'save',id:saved.id,copy:{...draft,en:{...draft.en,replies:draft.en.replies.filter(reply=>reply.trim())},zh:{...draft.zh,replies:draft.zh.replies.filter(reply=>reply.trim())}},expectedRevision:saved.revision})}).then(readResponse<TopicShareData>);
   apply(data);setMessage('中英文卡片、配文和补充回复已保存。');if(data.record)onRecordSaved?.(data.record);
  }catch(cause){if(cause instanceof TopicShareRequestError&&cause.status===409)setConflict(true);setError(cause instanceof Error?cause.message:'保存失败，本地编辑已保留。');}
  finally{setOperation(null);}
 }
 async function copyPost(){if(!selected)return;try{await navigator.clipboard.writeText(selected.text);setMessage(`已复制${language==='en'?'英文':'中文'}配文。`);}catch{setError('复制失败，可从配文编辑框手动复制。');}}
 async function download(languages:TopicShareLanguage[]){
  if(busy||dirty||!saved||!draft||conflict)return;
  const record={...saved,copy:draft};
  setOperation('export');setExportLanguages(languages);setError('');setMessage('');
  try{
   topicShareTextFiles(record);await nextPaint();
   const cards=exportRoot.current?.querySelectorAll<HTMLElement>('.topic-share-card');if(!cards||cards.length!==languages.length)throw new Error('下载画布尚未准备好，请重试。');
   for(const card of cards)fitTopicShareCard(card,card.dataset.topicLanguage?.toUpperCase()??'');
   const {toBlob}=await import('html-to-image');
   const pngs:Partial<Record<TopicShareLanguage,Uint8Array>>={};
   for(const card of cards){
    const lang=card.dataset.topicLanguage as TopicShareLanguage;
    const blob=await toBlob(card,{width:TOPIC_SHARE_WIDTH,height:card.offsetHeight,pixelRatio:1,backgroundColor:'#f8fafc',skipFonts:true});
    if(!blob)throw new Error(`${lang.toUpperCase()} PNG 导出失败。`);
    if(languages.length===1)downloadBlob(blob,`WcCAT-${record.source.date}-${record.copy.column}-${lang}.png`);
    else pngs[lang]=new Uint8Array(await blob.arrayBuffer());
   }
   if(languages.length===2){const bytes=await createTopicShareZip(record,pngs as Record<TopicShareLanguage,Uint8Array>);downloadBlob(new Blob([bytes],{type:'application/zip'}),`WcCAT-${record.source.date}-${record.copy.column}-bilingual.zip`);}
   setMessage(languages.length===2?'已导出双语 PNG、所选配文、回复、Alt text、来源与实验说明。':'已导出当前语言 PNG。');
  }catch(cause){setError(cause instanceof Error?cause.message:'下载失败，请检查文案长度后重试。');}
  finally{setOperation(null);setExportLanguages(undefined);}
 }
 function keyboard(event:React.KeyboardEvent<HTMLElement>){
  if(event.key==='Escape'){event.stopPropagation();close();return;}
  if(event.key!=='Tab')return;
  const focusable=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]');
  const first=focusable?.[0],last=focusable?.[focusable.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }

 return <div className="topic-share-backdrop"><section className="topic-share-editor" role="dialog" aria-modal="true" aria-labelledby="topic-share-editor-title" ref={dialog} onKeyDown={keyboard}>
  <header className="topic-editor-header"><div><p className="topic-eyebrow">ONE STORY / TWO LANGUAGES</p><h2 id="topic-share-editor-title">单话题分享</h2><p>读取与预览不会调用 AI。点击生成后创建后台任务。</p></div>{onClose?<button type="button" ref={closeButton} onClick={close} aria-label="关闭单话题编辑器">关闭 ×</button>:null}</header>
  {requestedKey!==activeKey?<div className="topic-notice"><p>所选话题已经变化；这里仍保留当前话题的编辑。</p><button type="button" disabled={busy} onClick={()=>{if(askToDiscard()){setActiveKey(requestedKey);setDirty(false);setConflict(false);}}}>载入所选话题</button></div>:null}
  {loading?<p role="status">正在读取这个保存版本的话题…</p>:current?.error?<div><p className="data-error" role="alert">{current.error}</p><button type="button" disabled={busy} onClick={reload}>重新读取话题</button></div>:null}
  {source&&loaded?<>
   <section className="topic-source-summary"><p className="topic-eyebrow">{source.date} · {source.ref.kind==='hourly'?'小时采样':'日报条目'} · 原榜 #{source.rank}</p><h3>{source.title}</h3><p>{source.summary}</p><details><summary>已保存事实与原始来源</summary><p>{source.detail}</p><p>{source.context}</p><ul>{source.links.map((link,index)=>{const href=topicSourceHref(link.url);return <li key={index}>{href?<a href={href} target="_blank" rel="noopener noreferrer">{link.sourceName} · {link.title} ↗</a>:`${link.sourceName} · 原文链接不可用`}</li>;})}</ul></details></section>
   <div className="topic-generation-bar"><label>栏目<select value={column} disabled={busy||dirty} onChange={event=>setColumn(event.target.value as EditorialColumn)}>{EDITORIAL_COLUMNS.map(item=><option key={item.id} value={item.id}>{item.en} / {item.zh}{eligibleColumns(generationSource??source).includes(item.id)?'':'（材料待核对）'}</option>)}</select></label><button type="button" className="data-primary" disabled={busy||dirty||conflict} onClick={generate}>{operation==='generate'?'正在创建任务…':saved?'重新生成双语文案 · AI':'生成双语文案 · AI'}</button><button type="button" disabled={busy} onClick={reload}>重新载入保存稿</button></div>
   {sourceChanged?<p className="topic-notice">源材料已有更新。当前预览和保存仍使用这份稿件的冻结来源；重新生成会使用最新材料。</p>:null}
   <p className="topic-small">{EDITORIAL_COLUMNS.find(item=>item.id===column)?.description} {saved&&column!==saved.copy.column?'新栏目在重新生成后生效。':''}</p>
   {!eligibleColumns(generationSource??source).includes('voices')?<p className="topic-small">原始评论只展示已保存、来源有效的内容；译文缺失或存疑时会提示，仍可生成和编辑双语正文。</p>:null}
   {loaded.recommendation.warnings.length?<details className="topic-evidence-notes"><summary>编辑判断与材料限制</summary><ul>{loaded.recommendation.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>:null}
   {job?<div className="topic-notice" role="status">后台生成中 · {job.progress||job.status} <a href="/admin?tab=tasks" target="_blank" rel="noopener noreferrer">查看任务日志 ↗</a></div>:null}
   {dirty?<p className="topic-notice" role="status">有未保存编辑。预览显示当前编辑稿；保存后才能导出或重新生成。中英文切换会保留两种语言的修改。</p>:null}
   {conflict?<div className="topic-conflict" role="alert"><p>服务器稿件或来源已更新。本地修改已保留，可先复制配文，再重新载入保存稿。</p></div>:null}
   {editableRecord&&local?<>
    <TopicShareReview warnings={reviewWarnings}/>
    <div className="topic-editor-toolbar"><div className="topic-language-tabs" role="tablist" aria-label="分享语言">{(['en','zh'] as const).map(lang=><button key={lang} type="button" role="tab" aria-selected={language===lang} aria-controls="topic-localized-content" id={`topic-language-${lang}`} disabled={operation==='export'} onClick={()=>setLanguage(lang)}>{lang==='en'?'English':'中文'}</button>)}</div><span className={dirty?'topic-draft-badge':'topic-saved-badge'}>{dirty?'未保存编辑':'已保存版本'}</span><button type="button" className="data-primary" disabled={busy||!dirty||conflict} onClick={save}>{operation==='save'?'正在保存…':'保存双语编辑'}</button></div>
    <div className="topic-editor-workspace" id="topic-localized-content" role="tabpanel" aria-labelledby={`topic-language-${language}`}>
     <section className="topic-copy-editor"><h3>{language==='en'?'English copy':'中文文案'}</h3><label>配文候选<select value={selected?.id??''} disabled={busy} onChange={event=>edit(copy=>({...copy,selectedPostId:event.target.value}))}>{local.posts.map((post,index)=><option key={post.id} value={post.id}>{index+1}. {postPatternLabels[post.pattern]??'其他角度'}{reviewWarnings.some(item=>item.path.startsWith(`${language}.posts[${index}].`))?' ⚠':''}</option>)}</select></label>{selected?<><p className="topic-small">选择理由：{selected.reason}</p><label>所选配文<textarea aria-label="所选配文" lang={language} rows={7} value={selected.text} disabled={busy} onChange={event=>edit(copy=>updateSelectedTopicSharePost(copy,event.target.value))}/></label></>:null}<button type="button" disabled={!selected} onClick={copyPost}>复制当前配文</button><details open><summary>编辑卡片与补充内容</summary>{fields.map(([field,label])=><label key={field}>{label}<textarea aria-label={label} lang={language} rows={field==='headline'||field==='hook'||field==='question'?2:3} value={local[field]} disabled={busy} onChange={event=>edit(copy=>({...copy,[field]:event.target.value}))}/></label>)}<label>补充回复 / 来源回复（每段一条）<textarea aria-label="补充回复 / 来源回复（每段一条）" lang={language} rows={5} value={local.replies.join('\n\n')} disabled={busy} onChange={event=>edit(copy=>({...copy,replies:event.target.value.split(/\n\s*\n/)}))}/></label></details></section>
     <section className="topic-preview-panel"><h3>品牌卡片预览</h3><div ref={previewRoot}><ScaledPoster width={TOPIC_SHARE_WIDTH} height={previewHeight}><TopicSharePoster record={editableRecord} language={language}/></ScaledPoster></div>{layoutError?<p className="data-error" role="alert">{layoutError}</p>:null}<p className="topic-small">1080 × {previewHeight} · {dirty?'当前编辑稿':'已保存稿'} · 真实评论沿用保存来源，不能在这里修改。</p><div className="topic-export-actions"><button type="button" disabled={busy||dirty||conflict||Boolean(layoutError)} onClick={()=>download([language])}>↓ {language==='en'?'English':'中文'} PNG</button><button type="button" disabled={busy||dirty||conflict||Boolean(layoutError)} onClick={()=>download(['en','zh'])}>↓ 双语完整 ZIP</button></div><p className="topic-small">ZIP：en.png / zh.png、双语配文、补充回复、Alt text、原始来源与实验说明。</p></section>
    </div>
   </>:<div className="topic-empty"><h3>尚未生成这个话题的双语分享</h3><p>先核对材料与栏目，再点击“生成双语文案 · AI”。生成后可独立编辑英文和中文内容。</p></div>}
  </>:null}
  {message?<p className="topic-notice" role="status">{message}</p>:null}{error?<p className="data-error" role="alert">{error}</p>:null}
  {exportLanguages&&editableRecord?createPortal(<div className="topic-share-render-root" ref={exportRoot} aria-hidden="true">{exportLanguages.map(lang=><TopicSharePoster key={lang} record={editableRecord} language={lang}/>)}</div>,document.body):null}
 </section></div>;
}
