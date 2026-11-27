import type {LocalizedTopicShare,TopicShareLanguage} from '../../lib/topic-sharing/types';

const coverFields=[['headline','主图标题'],['summary','主图新闻简述'],['whyItMatters','主图一句点评'],['altText','图片替代文字 / Alt text']] as const;
const legacyFields=[['headline','卡片标题'],['hook','开头切入'],['summary','发生了什么'],['context','理解背景'],['whyItMatters','为什么值得关注'],['question','讨论问题'],['altText','图片替代文字 / Alt text']] as const;

export function TopicShareCopyFields({copy,news,language,disabled,onChange}:{copy:LocalizedTopicShare;news:boolean;language:TopicShareLanguage;disabled:boolean;onChange:(copy:LocalizedTopicShare)=>void}){
 const fields=news?coverFields:legacyFields;
 return <>
  {fields.map(([field,label])=><label key={field}>{label}<textarea aria-label={label} lang={language} rows={field==='headline'||field==='hook'||field==='question'?2:3} value={copy[field]} disabled={disabled} onChange={event=>onChange({...copy,[field]:event.target.value})}/></label>)}
  {news?<div><h3>网友态度标题</h3>{(['redLabel','blueLabel'] as const).map(field=><label key={field}>{field==='redLabel'?'红方态度':'蓝方态度'}<input aria-label={field==='redLabel'?'红方态度':'蓝方态度'} lang={language} value={copy.attitudes?.[field]??''} disabled={disabled} onChange={event=>onChange({...copy,attitudes:{redLabel:copy.attitudes?.redLabel??'',blueLabel:copy.attitudes?.blueLabel??'',[field]:event.target.value}})}/></label>)}</div>:null}
  <section className="topic-article-editor"><h3>配套文章 · {language==='en'?'English':'中文'}</h3><p className="topic-small">文章保存在对应的公开页面；主帖发图与简述，评论区发布文章链接。可独立修改，保存后准备页面。</p>
   <label>文章标题<input aria-label="文章标题" lang={language} value={copy.article?.title??''} disabled={disabled} onChange={event=>onChange({...copy,article:{title:event.target.value,body:copy.article?.body??''}})}/></label>
   <label>文章正文<textarea aria-label="文章正文" lang={language} rows={18} value={copy.article?.body??''} disabled={disabled} onChange={event=>onChange({...copy,article:{title:copy.article?.title??copy.headline,body:event.target.value}})}/></label>
  </section>
 </>;
}
