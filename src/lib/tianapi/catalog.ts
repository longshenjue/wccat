import {getSourceById} from '../sources';
import {normalizeTitle} from '../normalize';
import type {RawHotItem,SourceConfig} from '../types';
import type {EvidenceItem} from '../evidence-types';

export const TIANAPI_ENDPOINTS=['networkhot','weibohot','nethot','toutiaohot','wxhottopic','douyinhot'] as const;
export type TianEndpoint=typeof TIANAPI_ENDPOINTS[number];
type Definition={id:number;platform:string;name:string;title:string;description?:string;heat?:string;auxiliary:boolean;url:(title:string)=>string};
const baidu=(title:string)=>'https://www.baidu.com/s?wd='+encodeURIComponent(title);
export const TIANAPI_CATALOG:Record<TianEndpoint,Definition>={
 networkhot:{id:223,platform:'tianapi-network',name:'全网聚合热搜',title:'title',description:'digest',heat:'hotnum',auxiliary:true,url:baidu},
 weibohot:{id:100,platform:'weibo',name:'微博热搜',title:'hotword',heat:'hotwordnum',auxiliary:false,url:title=>'https://s.weibo.com/weibo?q='+encodeURIComponent(title)},
 nethot:{id:68,platform:'baidu',name:'百度热搜',title:'keyword',description:'brief',heat:'index',auxiliary:false,url:baidu},
 toutiaohot:{id:244,platform:'toutiao',name:'今日头条',title:'word',heat:'hotindex',auxiliary:false,url:title=>'https://www.toutiao.com/search/?keyword='+encodeURIComponent(title)},
 wxhottopic:{id:196,platform:'tencent-hot',name:'腾讯生态热搜',title:'word',auxiliary:true,url:title=>'https://weixin.sogou.com/weixin?type=2&query='+encodeURIComponent(title)},
 douyinhot:{id:155,platform:'douyin',name:'抖音热点',title:'word',heat:'hotindex',auxiliary:false,url:title=>'https://www.douyin.com/search/'+encodeURIComponent(title)}
};
export function tianSource(endpoint:TianEndpoint):SourceConfig {
 const def=TIANAPI_CATALOG[endpoint];
 return getSourceById(def.platform)??{id:def.platform,name:def.platform,displayName:def.name,kind:'third-party',category:'news',weight:0,primaryUrl:def.url(''),notes:'辅助热榜证据，不计入独立平台评分'};
}
export function endpointForPlatform(platform:string) {
 return TIANAPI_ENDPOINTS.find(endpoint=>!TIANAPI_CATALOG[endpoint].auxiliary&&TIANAPI_CATALOG[endpoint].platform===platform);
}
function heat(value:unknown) {
 const text=typeof value==='string'?value.trim().replaceAll(',',''):typeof value==='number'?String(value):'';
 const match=text.match(/^(\d+(?:\.\d+)?)\s*(万|亿)?$/);if(!match)return undefined;
 const number=Number(match[1])*(match[2]==='亿'?1e8:match[2]==='万'?1e4:1);
 return Number.isFinite(number)&&number>=0&&number<=Number.MAX_SAFE_INTEGER?number:undefined;
}
export function normalizeTianItems(endpoint:TianEndpoint,list:unknown[],observedAt:string) {
 if(list.length>500)throw new Error('TianAPI list 超过条目上限');
 const def=TIANAPI_CATALOG[endpoint],source=tianSource(endpoint),items:RawHotItem[]=[],evidence:EvidenceItem[]=[],seen=new Set<string>();let invalid=0;
 for(const [index,value] of list.entries()){
  if(!value||typeof value!=='object'||Array.isArray(value)){invalid++;continue;}
  const raw=value as Record<string,unknown>,title=typeof raw[def.title]==='string'?String(raw[def.title]).trim():'';
  if(!title||title.length>500||!normalizeTitle(title)){invalid++;continue;}
  const description=def.description&&typeof raw[def.description]==='string'?String(raw[def.description]).slice(0,1000):undefined;
  const heatValue=def.heat?heat(raw[def.heat]):undefined;
  const heatText=def.heat&&raw[def.heat]!==undefined?String(raw[def.heat]).slice(0,100):undefined;
  const item:RawHotItem={sourceId:source.id,sourceName:source.displayName,sourceKind:source.kind,sourceCategory:source.category,
   rank:index+1,title,url:def.url(title),description,heatValue,heatText,fetchedAt:observedAt,contentType:'topic',provider:'tianapi',providerEndpoint:endpoint};
  evidence.push({url:item.url,kind:'topic',title,description,rank:index+1,heatValue,heatText,heatUnit:heatText?'platform_hot_index':undefined,payload:raw});
  const identity=normalizeTitle(title);if(!seen.has(identity)){items.push(item);seen.add(identity);}
 }
 if(list.length&&!items.length)throw new Error('TianAPI list 未包含有效话题');
 return {items,evidence,invalid};
}
