import type {ZipEntry} from '../client-zip';
import type {PublicationLanguage,PublicationReference} from './types';

export function publicationMaterials(reference:PublicationReference,origin:string,language:PublicationLanguage,hasComments:boolean,hasArticle=false){
 if(!/^[a-f0-9]{24}$/.test(reference.id)||reference.path!=='/p/'+reference.id||reference.reference!==reference.id.slice(0,8).toUpperCase())throw new Error('资料页链接无效。');
 const base=new URL(origin);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('资料页站点地址无效。');
 const url=new URL(reference.path,base.origin);url.searchParams.set('lang',language);
 const intro=hasArticle?(language==='en'?'Full story, background, our take and original sources:':'完整报道、背景、点评与原始来源：'):language==='en'?(hasComments?'Sources & context: original Chinese posts and the individual comments quoted here.':'Sources & context: original Chinese sources and background for this post.'):(hasComments?'原始来源、图中引用的个人评论与补充背景，整理在这里：':'原始来源与补充背景，整理在这里：');
 return {url:url.href,reply:`${intro}\n${url.href}`,indexUrl:new URL('/read',base.origin).href};
}
export function publicationTextFiles(reference:PublicationReference,origin:string,comments:Record<PublicationLanguage,boolean>,articles:Record<PublicationLanguage,boolean>={en:false,zh:false}):ZipEntry[]{
 const en=publicationMaterials(reference,origin,'en',comments.en,articles.en),zh=publicationMaterials(reference,origin,'zh',comments.zh,articles.zh);
 return [{name:'source-reply-en.txt',text:en.reply},{name:'source-reply-zh.txt',text:zh.reply},{name:'publication.txt',text:`WcCAT #${reference.reference}\nEnglish: ${en.url}\n中文: ${zh.url}\nProfile index: ${en.indexUrl}`}].map(({name,text})=>({name,data:new TextEncoder().encode(text+'\n')}));
}
