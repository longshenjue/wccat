import type {ZipEntry} from '../client-zip';
import type {TopicShareLanguage,TopicShareRecord} from './types';
import {usableTopicQuotes} from './recommendation';
import type {PublicationReference} from '../publications/types';
import {publicationTextFiles} from '../publications/materials';
export type TopicPublicationExport={reference:PublicationReference;origin:string};

/** Only frozen, validated HTTP(S) citations enter a download. */
export function topicSourceHref(value:string):string|undefined {
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}

export function topicShareTextFiles(record:TopicShareRecord,publication?:TopicPublicationExport):ZipEntry[] {
 if(record.copy.sourceFingerprint!==record.source.fingerprint)throw new Error('分享来源版本不一致，请重新载入已保存稿。');
 const files:Array<{name:string;text:string}>=[];
 for(const language of ['en','zh'] as const){
  const copy=record.copy[language],selected=copy.posts.find(post=>post.id===copy.selectedPostId)??copy.posts[0];
  if(!selected)throw new Error(`${language==='en'?'EN':'中文 zh'} 没有配文候选，请先添加配文。`);
  files.push({name:`post-${language}.txt`,text:selected.text},{name:`replies-${language}.txt`,text:copy.replies.join('\n\n')},{name:`alt-${language}.txt`,text:copy.altText});
 }
 // Group caption/reply/alt files by purpose so the bilingual pair stays together.
 const ordered=['post-en.txt','post-zh.txt','replies-en.txt','replies-zh.txt','alt-en.txt','alt-zh.txt'].map(name=>files.find(file=>file.name===name)!);
 const source=record.source,quotes=usableTopicQuotes(source,'zh');
 for(const language of ['en','zh'] as const){const article=record.copy[language].article;if(article?.body)ordered.push({name:`article-${language}.md`,text:`# ${article.title}\n\n${article.body}\n\n## ${language==='en'?'Sources':'来源'}\n\n${(source.research?.documents??[]).map(doc=>`- [${doc.id}] ${doc.publisher} · ${doc.title}\n  ${doc.url}`).join('\n')}`});}
 ordered.push({name:'sources.txt',text:[
  'WcCAT · Single story / 单话题',source.date,`Original title: ${source.title}`,`Source key: ${source.sourceKey}`,`Frozen source fingerprint: ${source.fingerprint}`,`Source ref: ${JSON.stringify(source.ref)}`,
  'Observed platform attention and selected comments are not a population survey. / 平台热度和评论摘选不代表总体民意。','',
  ...source.links.flatMap(link=>{const url=topicSourceHref(link.url);return url?[`${link.sourceName} · ${link.title}`,url]:[];}),
  ...(source.research?.documents??[]).flatMap(doc=>['',`[${doc.id}] ${doc.publisher} · ${doc.title}`,doc.url,...(doc.publishedAt?[`Published: ${doc.publishedAt}`]:[])]),
  ...quotes.flatMap(({quote})=>['',`Comment ID: ${quote.id}`,`Source: ${quote.sourceName} · ${quote.url}`,`Likes: ${quote.likes??'not provided'}`,`Original: ${quote.text}`,...(quote.englishText?[`AI translation${quote.englishIsExcerpt?' (excerpt)':''}: ${quote.englishText}`]:[])])
 ].join('\n')});
 ordered.push({name:'experiment-notes.txt',text:[
  'Editorial copy experiments; not a viral forecast or a guarantee of reach.',
  '编辑实验，不是爆款预测；没有 X 互动数据或效果保证。',
  `Column: ${record.copy.column}`,`Saved revision: ${record.revision}`,`Generated copy: ${record.copy.generatedAt}`,`Model: ${record.copy.model}`,'',
  ...(['en','zh'] as const).flatMap(language=>[`${language.toUpperCase()} caption candidates:`,...record.copy[language].posts.flatMap(post=>[`${post.id===record.copy[language].selectedPostId?'[selected] ':''}${post.id} · ${post.pattern}`,post.reason,post.text,''])])
 ].join('\n')});
 return [...ordered.map(({name,text})=>({name,data:new TextEncoder().encode(text+'\n')})),...(publication?publicationTextFiles(publication.reference,publication.origin,{en:usableTopicQuotes(record.source,'en').length>0,zh:quotes.length>0},{en:!!record.copy.en.article?.body,zh:!!record.copy.zh.article?.body}):[])];
}

export async function createTopicShareZip(record:TopicShareRecord,pngs:Record<TopicShareLanguage,Uint8Array>,publication?:TopicPublicationExport):Promise<Uint8Array<ArrayBuffer>> {
 const texts=topicShareTextFiles(record,publication);
 for(const language of ['en','zh'] as const)if(!pngs[language]?.byteLength)throw new Error(`${language==='en'?'EN':'中文 zh'} PNG 尚未生成，不能导出不完整 ZIP。`);
 const {createStoreZip}=await import('../client-zip');
 return createStoreZip([{name:'en.png',data:pngs.en},{name:'zh.png',data:pngs.zh},...texts]);
}

/** Preserve full draft text: compact if needed, then expand the canvas vertically. */
export function fitTopicShareCard(card:HTMLElement,identity:string):boolean {
 const overflows=()=>[...card.querySelectorAll<HTMLElement>('[data-topic-fit]')].some(zone=>zone.scrollHeight>zone.clientHeight+1||zone.scrollWidth>zone.clientWidth+1);
 card.classList.remove('topic-share-compact');
 if(card.style&&card.dataset?.topicBaseHeight){card.style.height=card.dataset.topicBaseHeight+'px';card.style.gridTemplateRows='';}
 if(!overflows())return false;
 card.classList.add('topic-share-compact');
 if(overflows()&&typeof getComputedStyle==='function'&&typeof card.querySelector==='function'){
  const header=card.querySelector<HTMLElement>('.topic-card-header'),content=card.querySelector<HTMLElement>('.topic-card-content'),footer=card.querySelector<HTMLElement>('.topic-card-footer');
  if(header&&content&&footer){
   const style=getComputedStyle(card),number=(value:string)=>Number.parseFloat(value)||0;
   // Grid tracks include borders; scroll/client measurements do not. Reserve both.
   const outerHeight=(zone:HTMLElement)=>Math.max(zone.offsetHeight,zone.scrollHeight+zone.offsetHeight-zone.clientHeight);
   const headerHeight=outerHeight(header),footerHeight=outerHeight(footer);
   const height=number(style.paddingTop)+number(style.paddingBottom)+2*number(style.rowGap)+headerHeight+footerHeight+content.scrollHeight+8;
   card.style.gridTemplateRows=`${headerHeight}px minmax(0,1fr) ${footerHeight}px`;card.style.height=Math.ceil(height)+'px';
  }
 }
 if(overflows())throw new Error(`卡片 ${identity} 超出 1080 × ${card.offsetHeight||1800} 安全区，请缩短文案后重试。`);
 return true;
}
