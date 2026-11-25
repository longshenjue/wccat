import {normalizeTitle} from './normalize';
import type {EngagementStats,PlatformScoreEvidence,PlatformTier,RawHotItem,TopicOccurrence} from './types';

/** Product parameters, not measured audience counts. See docs/daily-ranking.md for evidence. */
export const PLATFORM_TIER_CAPS:Record<PlatformTier,number>={S:500,A:400,B:300,C:200,D:100};
// Editorial overrides: prioritize Zhihu discussion and reduce Douyin noise for this account.
const policies:Record<string,{tier:PlatformTier;scaleStatus:'referenced'|'historical'|'provisional'}>={
 weibo:{tier:'S',scaleStatus:'referenced'},baidu:{tier:'S',scaleStatus:'referenced'},douyin:{tier:'B',scaleStatus:'provisional'},
 bilibili:{tier:'A',scaleStatus:'referenced'},toutiao:{tier:'A',scaleStatus:'provisional'},xiaohongshu:{tier:'A',scaleStatus:'provisional'},
 zhihu:{tier:'S',scaleStatus:'historical'},'qq-news':{tier:'B',scaleStatus:'provisional'},'sina-news':{tier:'B',scaleStatus:'provisional'},
 'netease-news':{tier:'B',scaleStatus:'provisional'},tieba:{tier:'B',scaleStatus:'provisional'},
 douban:{tier:'C',scaleStatus:'provisional'},hupu:{tier:'C',scaleStatus:'provisional'},thepaper:{tier:'C',scaleStatus:'provisional'},
 '36kr':{tier:'C',scaleStatus:'provisional'},ithome:{tier:'C',scaleStatus:'provisional'},huxiu:{tier:'C',scaleStatus:'provisional'},
 ngabbs:{tier:'D',scaleStatus:'provisional'},sspai:{tier:'D',scaleStatus:'provisional'},
 cctv:{tier:'C',scaleStatus:'provisional'},xinhua:{tier:'C',scaleStatus:'provisional'}
};

export function platformPolicy(sourceId:string) {
 if(!Object.hasOwn(policies,sourceId))return;
 const policy=policies[sourceId];
 return policy?{...policy,cap:PLATFORM_TIER_CAPS[policy.tier]}:undefined;
}

/** Provider names and alternate URLs do not turn a source topic into several observations. */
export function platformItemKey(item:Pick<RawHotItem,'sourceId'|'title'|'url'>):string {
 return `${item.sourceId}:${normalizeTitle(item.title)||item.url}`;
}

export function platformRank(item:Pick<RawHotItem,'sourceId'|'rank'>):number|undefined {
 if(!platformPolicy(item.sourceId)||!Number.isSafeInteger(item.rank))return;
 const rank=item.sourceId==='weibo'&&item.rank===0?1:item.rank;
 return rank>=1&&rank<=50?rank:undefined;
}

const statNames=['views','reads','plays','comments','replies','likes','dislikes','upvotes','downvotes','favorites','shares','danmaku'] as const;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function maximum(...values:(number|undefined)[]):number|undefined {
 const valid=values.filter(finite);return valid.length?Math.max(...valid):undefined;
}
type Metric=(item:RawHotItem)=>number|undefined;
const audience:Metric=item=>maximum(item.stats?.views,item.stats?.reads,item.stats?.plays);
const approval:Metric=item=>maximum(item.stats?.likes,item.stats?.upvotes);
const responses:Metric=item=>maximum(item.stats?.comments,item.stats?.replies);
const opposition:Metric=item=>maximum(item.stats?.dislikes,item.stats?.downvotes);
const metricGroups:Metric[][]=[
 [audience],
 [approval,item=>item.stats?.favorites,item=>item.stats?.shares,opposition],
 [responses,item=>item.stats?.danmaku]
];

/** No single-item or sparsely populated field can declare itself a top percentile. */
function percentileMetric(pool:RawHotItem[],metric:Metric):(item:RawHotItem)=>number|undefined {
 const values=pool.map(metric).filter(finite).sort((a,b)=>a-b);
 if(values.length<5||values.length/pool.length<.6||values[0]===values.at(-1))return ()=>undefined;
 return item=>{
  const value=metric(item);if(!finite(value))return;
  let below=0,equal=0;
  for(const candidate of values){if(candidate<value)below++;else if(candidate===value)equal++;}
  return (below+equal*.5)/values.length;
 };
}
function average(values:(number|undefined)[]):number|undefined {
 const valid=values.filter(finite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:undefined;
}

/** Comparisons never cross source boundaries. Raw count magnitudes never escape the tier cap. */
export function scorePlatformItems(items:readonly RawHotItem[]):TopicOccurrence[] {
 const eligible=items.filter(item=>platformRank(item)!==undefined);
 const unique=new Map<string,RawHotItem>();
 for(const item of eligible){
  const key=platformItemKey(item),previous=unique.get(key);
  if(!previous){unique.set(key,{...item,stats:item.stats?{...item.stats}:undefined});continue;}
  const stats:EngagementStats={};
  for(const name of statNames){const value=maximum(previous.stats?.[name],item.stats?.[name]);if(value!==undefined)stats[name]=value;}
  unique.set(key,{...previous,rank:Math.min(platformRank(previous)!,platformRank(item)!),heatValue:maximum(previous.heatValue,item.heatValue),stats});
 }
 const bySource=new Map<string,RawHotItem[]>();
 for(const item of unique.values()){
  const pool=bySource.get(item.sourceId)??[];pool.push(item);bySource.set(item.sourceId,pool);
 }
 const scores=new Map<string,PlatformScoreEvidence>();
 for(const [id,pool] of bySource){
  const policy=platformPolicy(id)!;
  const heat=percentileMetric(pool,item=>item.heatValue);
  const groups=metricGroups.map(metrics=>metrics.map(metric=>percentileMetric(pool,metric)));
  for(const item of pool){
   const rankStrength=Math.max(.05,1-(platformRank(item)!-1)/50);
   const heatStrength=heat(item);
   const engagementStrength=average(groups.map(metrics=>average(metrics.map(metric=>metric(item)))));
   const parts:[[number,number],...[number,number][]]=[[rankStrength,.6]];
   if(heatStrength!==undefined)parts.push([heatStrength,.1]);
   if(engagementStrength!==undefined)parts.push([engagementStrength,.3]);
   const strength=parts.reduce((sum,[value,weight])=>sum+value*weight,0)/parts.reduce((sum,[,weight])=>sum+weight,0);
   scores.set(platformItemKey(item),{policy:'platform-tier-v3',tier:policy.tier,cap:policy.cap,rankStrength,heatStrength,engagementStrength,strength:Math.min(1,strength)});
  }
 }
 return eligible.map(item=>{
  const platformScoring=scores.get(platformItemKey(item))!;
  return {...item,normalizedTitle:normalizeTitle(item.title),platformScore:platformScoring.cap*platformScoring.strength,platformScoring};
 });
}
