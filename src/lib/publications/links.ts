import type {PublicationLanguage,PublicationLink} from './types';

export function publicationHref(value:string):string|undefined {
 try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!/^(?:localhost|127\.|0\.|\[|169\.254\.)/i.test(url.hostname))return url.href;}catch{return;}
}
export function publicationLink(source:{sourceId:string;sourceName:string;title:string;url:string}):PublicationLink|undefined {
 const href=publicationHref(source.url);if(!href)return;
 const url=new URL(href);
 const forumPost=url.hostname==='bbs.hupu.com'&&/^\/\d+\.html$/.test(url.pathname);
 const kind:PublicationLink['kind']=url.hostname==='s.weibo.com'||url.hostname==='www.baidu.com'||/\/search(?:\/|$)/.test(url.pathname)?'search':/\/hot\/|\/hottopic\/|\/trending\//.test(url.pathname)?'topic':forumPost?'post':/\/rain\/a\/|\/dy\/article\/|\.s?html?$|newsDetail_forward_|\/html\/|\/article\//.test(url.pathname)?'article':/\/video\/|\/question\/|\/p\/|\/detail\/|\/status\/|\/group\/topic\/|\/w\//.test(url.pathname)?'post':'link';
 return {sourceId:source.sourceId,name:source.sourceName,title:source.title,url:href,kind};
}
const names:Record<string,string>={weibo:'Weibo',baidu:'Baidu',douyin:'Douyin',toutiao:'Toutiao',xiaohongshu:'Xiaohongshu (RedNote)',ngabbs:'NGA','36kr':'36Kr',sspai:'SSPAI',bilibili:'Bilibili',zhihu:'Zhihu',hupu:'Hupu',douban:'Douban',tieba:'Baidu Tieba',thepaper:'The Paper','qq-news':'Tencent News','sina-news':'Sina News','netease-news':'NetEase News',ithome:'IT Home',huxiu:'Huxiu'};
export const publicationSourceName=(link:Pick<PublicationLink,'sourceId'|'name'>,language:PublicationLanguage)=>language==='en'&&Object.hasOwn(names,link.sourceId)?names[link.sourceId]:link.name;
export const publicationLinkLabel=(kind:PublicationLink['kind'],language:PublicationLanguage)=>({article:{en:'Original article',zh:'原报道'},post:{en:'Original post',zh:'原帖'},topic:{en:'Topic page',zh:'话题页'},search:{en:'Search results',zh:'搜索结果'},link:{en:'Source link',zh:'来源链接'}}[kind][language]);
