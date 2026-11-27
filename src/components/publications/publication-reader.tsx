import Link from 'next/link';
import type {Publication,PublicationLanguage} from '../../lib/publications/types';
import {publicationReference} from '../../lib/publications/store';
import {publicationLinkLabel,publicationSourceName} from '../../lib/publications/links';
import {RelatedDevelopments} from '../related-developments';
import {ArticleText} from './article-text';

export function PublicationBrand(){return <strong className="publication-brand"><span>Wc</span><span>CAT</span></strong>;}
export function PublicationReader({publication,language}:{publication:Publication;language:PublicationLanguage}){
 const en=language==='en',data=publication.payload,ref=publicationReference(publication.id);
 const singleArticle=data.kind!=='daily'&&data.cards.length===1&&!!data.cards[0][language].article?.body;
 const articleTitle=singleArticle?data.cards[0][language].article?.title:undefined;
 return <main className="publication-shell" lang={language}><div className="publication-page">
  <header className="publication-nav"><Link href={`/read?lang=${language}`} aria-label="WcCAT"><PublicationBrand/></Link><nav aria-label={en?'Language':'语言'}><Link href={`${ref.path}?lang=en`} aria-current={en?'page':undefined}>English</Link><Link href={`${ref.path}?lang=zh`} aria-current={!en?'page':undefined}>中文</Link></nav></header>
  <div className="publication-intro"><p className="publication-kicker">{en?'SOURCES & CONTEXT':'来源与背景'} · #{ref.reference}</p><h1>{articleTitle||data.titles[language]}</h1><p>{singleArticle?(en?'News, background and WcCAT’s take, with original sources.':'新闻、背景与 WcCAT 点评，附原始来源。'):en?'The context, original Chinese sources and individual comments behind this WcCAT post.':'这条 WcCAT 帖子的背景、中文原始来源与个人评论。'}</p><small>{en?'Edition':'内容所属日期'} · {data.date}</small></div>
  {data.kind==='daily'?<nav className="publication-contents" aria-label={en?'Daily stories':'日报话题'}><h2>{en?'In this edition':'本期话题'}</h2><ol>{data.cards.map(card=><li key={card.id}><a href={`#${card.id}`}>{card.rank.toString().padStart(2,'0')} · {card[language].title||card.zh.title}{card.selected?<span>{en?'Closer look':'详情卡'}</span>:null}</a></li>)}</ol></nav>:null}
  {data.cards.map(card=>{const copy=card[language];return <article key={card.id} id={card.id} className="publication-story">
   {!singleArticle?<><p className="publication-kicker">{en?'ORIGINAL RANK':'原榜'} #{card.rank}</p><h2>{copy.article?.title||copy.title||card.zh.title}</h2></>:null}
   {copy.article?.body?<ArticleText body={copy.article.body} sources={card.links} headingLevel={singleArticle?2:3}/>:<>
    {copy.summary?<section><h3>{en?'What happened':'发生了什么'}</h3><p>{copy.summary}</p></section>:null}
    {copy.context?<section><h3>{en?'The context':'理解背景'}</h3><p>{copy.context}</p></section>:null}
    {copy.why?<section><h3>{data.kind==='daily'?(en?'Why it matters':'为什么值得关注'):(en?'Our take':'WcCAT点评')}</h3><p>{copy.why}</p></section>:null}
   </>}
   <RelatedDevelopments english={en} developments={(card.relatedDevelopments??[]).map(stage=>({title:stage.title,summary:stage.summary,links:stage.links.map(link=>({url:link.url,name:publicationSourceName(link,language)}))}))}/>
   {card.comments.length?<section className="publication-comments"><h3>{en?'In their words':'用户怎么说'}</h3><p className="publication-note">{en?'Individual comments, not a poll or a representative view.':'以下为个人评论，不代表民调或总体意见。'}</p>{card.comments.map((comment,index)=><figure key={index} className={`publication-comment publication-comment-${comment.side}`}>
    <figcaption><a href={comment.url} target="_blank" rel="noopener noreferrer">{publicationSourceName({sourceId:comment.sourceId,name:comment.sourceName},language)} ↗</a>{comment.likes!==undefined?<span>{comment.likes.toLocaleString(en?'en-US':'zh-CN')} {en?'observed likes':'赞'}</span>:null}</figcaption>
    <small>{en?'Original Chinese':'中文原文'}</small><blockquote>{comment.text}</blockquote>{en&&comment.englishText?<><small>AI translation{comment.englishIsExcerpt?' · source excerpt':''}</small><blockquote>{comment.englishText}</blockquote></>:en?<p className="publication-note">English translation unavailable; the original is preserved.</p>:null}
   </figure>)}</section>:null}
   <section className="publication-sources"><h3>{en?'Original sources':'原始来源'}</h3>{card.links.length?<ul>{card.links.map((link,index)=><li key={index} id={link.researchId}><span>{publicationLinkLabel(link.kind,language)}</span><a href={link.url} target="_blank" rel="noopener noreferrer">{publicationSourceName(link,language)} ↗</a><p>{link.title}</p></li>)}</ul>:<p>{en?'No original link was saved for this story.':'这条话题没有保存可用的原始链接。'}</p>}{card.imageUrl?<p><a href={card.imageUrl} target="_blank" rel="noopener noreferrer">{en?'Source image':'原始配图'} ↗</a></p>:null}</section>
  </article>;})}
  <footer className="publication-footer"><p>{en?'WcCAT adds context to Chinese internet attention. Analysis and translations should be read alongside the original sources.':'WcCAT 为中文互联网热点补充背景。解读与译文请结合原始来源阅读。'}</p><div><Link href={`/read?lang=${language}`}>{en?'Browse more editions':'查看其他内容'}</Link><a href="https://x.com/wccat_2026" target="_blank" rel="noopener noreferrer">{en?'Follow WcCAT on X':'在 X 关注 WcCAT'} ↗</a></div></footer>
 </div></main>;
}
