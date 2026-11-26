import type {CommentExamples} from '../lib/comments/types';
import {visibleCommentQuotes,excerptComment} from '../lib/comments/selection';

function CatMarker({side,language}:{side:'red'|'blue';language:'zh'|'en'}){
 return <svg className="comment-cat" viewBox="0 0 64 64" role="img" aria-label={language==='en'?(side==='red'?'Red cat attitude marker':'Blue cat attitude marker'):(side==='red'?'红色小猫观点标记':'蓝色小猫观点标记')}>
  <circle cx="32" cy="32" r="29" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2.5"/>
  <path d="M15 29 14 13 28 21 Q32 19 36 21 L50 13 49 30 Q55 49 32 52 Q9 49 15 29Z" fill="currentColor"/>
  <path d="m18 19 1 9 6-5m21-4-1 9-6-5" fill="#fff" fillOpacity=".6"/>
  <ellipse cx="24" cy="34" rx="3" ry="4" fill="#10182b"/><ellipse cx="40" cy="34" rx="3" ry="4" fill="#10182b"/>
  <path d="m29 40 3 3 3-3m-3 3q-5 7-9 1m9-1q5 7 9 1" fill="none" stroke="#10182b" strokeWidth="2" strokeLinecap="round"/>
  <path d="m12 38 10 2m-10 5 10-2m30-5-10 2m10 5-10-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
 </svg>;
}
const names:Record<string,string>={bilibili:'Bilibili',zhihu:'Zhihu',weibo:'Weibo',hupu:'Hupu',douban:'Douban',tieba:'Baidu Tieba',thepaper:'The Paper','qq-news':'Tencent News','sina-news':'Sina News','netease-news':'NetEase News',ithome:'IT Home',huxiu:'Huxiu',toutiao:'Toutiao'};
/** Absent, unclassified or untranslated samples occupy no space. */
export function CommentQuotes({examples,battle,language='zh',allowMixedEnglish=false}:{examples?:CommentExamples;battle?:{redLabel:string;blueLabel:string};language?:'zh'|'en';allowMixedEnglish?:boolean}){
 const rows=visibleCommentQuotes(examples,battle,language,{allowMixedEnglish});if(!rows.length)return null;
 const en=language==='en';
 return <section className="comment-quotes" aria-label={en?'Actual sampled comments':'实际采样评论'}>
  <div className="comment-quotes-heading"><strong>{en?'IN THEIR WORDS':'用户怎么说'}</strong><span>{en?'Selected comments':'评论摘选'}</span></div>
  <div className="comment-quotes-list">{rows.map(({side,quote,text})=>{
   const excerpt=excerptComment(text,language);
   return <article key={side} className={`comment-quote comment-quote-${side}`}>
    <CatMarker side={side} language={language}/><div className="comment-quote-content">
     <blockquote><p>“{excerpt.text}”</p></blockquote>
     <div className="comment-meta"><a href={quote.url} target="_blank" rel="noreferrer">{en?names[quote.sourceId]??quote.sourceName:quote.sourceName} ↗</a>{typeof quote.likes==='number'?<span>{quote.likes.toLocaleString(en?'en-US':'zh-CN')} {en?'likes':'赞'}</span>:null}<span>{en?'AI translation':'原文'}{(excerpt.excerpt||(en&&quote.englishIsExcerpt))?(en?' · excerpt':'节选'):''}</span></div>
    </div>
   </article>;
  })}</div>
  <p className="comment-sampling-note">{en?`From ${examples!.sampleCount} sampled comments · not a poll. Cats mark attitudes, not authors.`:`从 ${examples!.sampleCount} 条评论中选取 · 非民调。小猫为观点标记，非作者头像。`}</p>
 </section>;
}
