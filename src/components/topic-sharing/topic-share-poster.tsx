import type {TopicShareLanguage,TopicShareRecord} from '../../lib/topic-sharing/types';
import {EDITORIAL_COLUMNS} from '../../lib/topic-sharing/columns';
import {usableTopicQuotes} from '../../lib/topic-sharing/recommendation';
import {topicSourceHref} from '../../lib/topic-sharing/export';
import {CommentQuotes} from '../comment-quotes';

export const TOPIC_SHARE_WIDTH=1080;
export function topicSharePosterHeight(record:TopicShareRecord,language:TopicShareLanguage):number {
 return usableTopicQuotes(record.source,language).length?2160:1800;
}

/** Frozen source evidence is rendered separately from editable localized copy. */
export function TopicSharePoster({record,language}:{record:TopicShareRecord;language:TopicShareLanguage}) {
 const en=language==='en',copy=record.copy[language],source=record.source;
 const column=EDITORIAL_COLUMNS.find(item=>item.id===record.copy.column);
 const examples=source.commentExamples??source.analysis?.commentExamples;
 const usable=usableTopicQuotes(source,language);
 const comments=examples?{...examples,red:usable.find(row=>row.side==='red')?.quote,blue:usable.find(row=>row.side==='blue')?.quote}:undefined;
 const links=source.links.flatMap(link=>{const href=topicSourceHref(link.url);return href?[{...link,href}]:[];});
 return <article className={`topic-share-card topic-share-${record.copy.column}`} style={{height:topicSharePosterHeight(record,language)}} lang={language} data-topic-language={language} data-topic-base-height={topicSharePosterHeight(record,language)} aria-label={`${en?'Single story':'单话题'} · ${copy.headline}`}>
  <header className="topic-card-header" data-topic-fit><strong className="topic-card-brand"><span>Wc</span><span>CAT</span></strong><div><b>{source.date}</b><span>{en?'CHINA, IN CONTEXT.':'看见中文互联网的关注。'}</span></div></header>
  <div className="topic-card-content" data-topic-fit>
   <div className="topic-card-series"><span>{en?column?.en:column?.zh}</span><b>{en?'A CLOSER LOOK':'今日细看'}</b></div>
   <p className="topic-card-hook">{copy.hook}</p><h1>{copy.headline}</h1>
   <section className="topic-card-section"><h2>{en?'WHAT HAPPENED':'发生了什么'}</h2><p>{copy.summary}</p></section>
   {copy.context?<section className="topic-card-section topic-card-context"><h2>{en?'THE CONTEXT':'理解背景'}</h2><p>{copy.context}</p></section>:null}
   <CommentQuotes examples={comments} battle={source.analysis?.battle} language={language} allowMixedEnglish/>
   <section className="topic-card-section topic-card-why"><h2>{en?'WHY IT MATTERS':'为什么值得关注'}</h2><p>{copy.whyItMatters}</p></section>
   {copy.question?<p className="topic-card-question">{copy.question}</p>:null}
  </div>
  <footer className="topic-card-footer" data-topic-fit><div className="topic-card-source-links"><b>{en?'SOURCES':'原始来源'}</b><span>{links.length?links.map((link,index)=><span key={`${link.sourceId}:${index}`}>{index?' / ':''}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.sourceName}</a></span>):en?'Original links unavailable':'原始链接未保存'}</span></div><p>{en?'Platform attention ≠ public opinion. Source links in sources.txt.':'平台关注 ≠ 总体民意。完整链接见 sources.txt。'}</p><strong>WcCAT <span>· {en?'ONE STORY / TWO LANGUAGES':'一件事，两种表达'}</span></strong></footer>
 </article>;
}
