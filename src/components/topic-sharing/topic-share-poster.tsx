/* eslint-disable @next/next/no-img-element -- Frozen inline images must be embedded unchanged by the PNG exporter. */
import type {TopicShareLanguage,TopicShareRecord} from '../../lib/topic-sharing/types';
import {EDITORIAL_COLUMNS} from '../../lib/topic-sharing/columns';
import {usableTopicQuotes} from '../../lib/topic-sharing/recommendation';
import {topicSourceHref} from '../../lib/topic-sharing/export';
import {CommentQuotes} from '../comment-quotes';
import type {PublicationReference} from '../../lib/publications/types';
import {topicReaderComments} from '../../lib/topic-sharing/readers';

export const TOPIC_SHARE_WIDTH=1080;
export function topicSharePosterHeight(record:TopicShareRecord,language:TopicShareLanguage):number {
 if(record.copy.editorialPolicy==='news-commentary-v2')return 1440;
 if(record.copy.editorialPolicy)return 1080;
 return usableTopicQuotes(record.source,language).length?2160:1800;
}

/** Frozen source evidence is rendered separately from editable localized copy. */
export function TopicSharePoster({record,language,publication}:{record:TopicShareRecord;language:TopicShareLanguage;publication?:PublicationReference}) {
 const en=language==='en',copy=record.copy[language],source=record.source;
 const news=!!record.copy.editorialPolicy;
 const column=EDITORIAL_COLUMNS.find(item=>item.id===record.copy.column);
 const examples=source.commentExamples??source.analysis?.commentExamples;
 const usable=usableTopicQuotes(source,language);
 const comments=examples?{...examples,red:usable.find(row=>row.side==='red')?.quote,blue:usable.find(row=>row.side==='blue')?.quote}:undefined;
 const readers=topicReaderComments(source);
 const researchLinks=(source.research?.documents??[]).map(doc=>({sourceId:'research',sourceName:doc.publisher,title:doc.title,url:doc.url})).sort((a,b)=>Number(/\.(?:gov|mil|int)\//i.test(b.url))-Number(/\.(?:gov|mil|int)\//i.test(a.url)));
 const links=(news?[...researchLinks,...source.links]:source.links).filter((link,index,rows)=>!news||rows.findIndex(row=>row.sourceName===link.sourceName)===index).flatMap(link=>{const href=topicSourceHref(link.url);return href?[{...link,href}]:[];}).slice(0,news?3:20);
 return <article className={`topic-share-card topic-share-${record.copy.column}${news?' topic-share-news':''}`} style={{height:topicSharePosterHeight(record,language)}} lang={language} data-topic-language={language} data-topic-base-height={topicSharePosterHeight(record,language)} aria-label={`${en?'Single story':'单话题'} · ${copy.headline}`}>
  <header className="topic-card-header" data-topic-fit><strong className="topic-card-brand"><span>Wc</span><span>CAT</span></strong><div><b>{source.date}</b><span>{en?'CHINA, IN CONTEXT.':'看见中文互联网的关注。'}</span></div></header>
  <div className="topic-card-content" data-topic-fit>
   <div className="topic-card-series"><span>{en?column?.en:column?.zh}</span><b>{en?'A CLOSER LOOK':'今日细看'}</b></div>
   {!news?<p className="topic-card-hook">{copy.hook}</p>:null}<h1>{copy.headline}</h1>
   <div className={source.photo?'topic-card-news-lead':undefined}>
    {source.photo?<figure className="topic-card-photo"><img src={`data:image/webp;base64,${source.photo.dataBase64}`} width={source.photo.width} height={source.photo.height} alt={en?'Source image for '+source.title:source.title}/><figcaption>{en?'Image: ':'配图：'}{source.photo.publisher}</figcaption></figure>:null}
    <section className="topic-card-section"><h2>{en?'WHAT HAPPENED':'发生了什么'}</h2><p>{copy.summary}</p></section>
   </div>
   {!news&&copy.context?<section className="topic-card-section topic-card-context"><h2>{en?'THE CONTEXT':'理解背景'}</h2><p>{copy.context}</p></section>:null}
   {record.copy.editorialPolicy==='news-commentary-v2'&&(readers.length>0||usable.length>0)&&source.analysis?.battle&&source.analysis.battle.redScore+source.analysis.battle.blueScore>0?<section className="topic-card-attitudes"><div className="topic-card-attitude-labels"><span>{copy.attitudes?.redLabel||(en?'Red view':source.analysis.battle.redLabel)}</span><span>{copy.attitudes?.blueLabel||(en?'Blue view':source.analysis.battle.blueLabel)}</span></div><div className="topic-card-attitude-energy"><span style={{flex:source.analysis.battle.redScore}}/><span style={{flex:source.analysis.battle.blueScore}}/></div><small>{en?'AI interpretation · individual comments below':'AI 态度解读 · 下方为真实网友原话'}</small></section>:null}
   <CommentQuotes examples={comments} battle={source.analysis?.battle} language={language} allowMixedEnglish observations={news?readers:undefined}/>
   <section className="topic-card-section topic-card-why"><h2>{news?(en?'OUR TAKE':'WcCAT点评'):(en?'WHY IT MATTERS':'为什么值得关注')}</h2><p>{copy.whyItMatters}</p></section>
   {!news&&copy.question?<p className="topic-card-question">{copy.question}</p>:null}
  </div>
  <footer className="topic-card-footer" data-topic-fit><div className="topic-card-source-links"><b>{en?'SOURCES':'原始来源'}</b><span>{links.length?links.map((link,index)=><span key={`${link.sourceId}:${index}`}>{index?' / ':''}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.sourceName}</a></span>):en?'Original links unavailable':'原始链接未保存'}</span></div><p>{en?'Platform attention ≠ public opinion.':'平台关注 ≠ 总体民意。'} {publication?(en?`Sources: profile link · #${publication.reference}`:`来源与原文：主页链接 · #${publication.reference}`):(en?'Sources & context: WcCAT profile link.':'来源与背景：WcCAT 主页链接。')}</p><strong>WcCAT <span>· {en?'ONE STORY / TWO LANGUAGES':'一件事，两种表达'}</span></strong></footer>
 </article>;
}
