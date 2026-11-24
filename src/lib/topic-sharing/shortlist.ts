import {browseDate,dailyBrowse,hourlyBrowse} from '../admin-browse';
import {normalizeTitle} from '../normalize';
import {loadTopicShareSource} from './source';
import {recommendTopic} from './recommendation';
import type {TopicShareCandidate,TopicShareRef} from './types';

export function editorialShortlist(value:unknown){
 const date=browseDate(value),previous=new Date(date+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
 const days=[date,previous.toISOString().slice(0,10)],candidates:TopicShareCandidate[]=[],identities=new Map<string,{topicId:string;urls:string[]}>();
 for(const day of days){
  const refs:TopicShareRef[]=[],daily=dailyBrowse(day);
  if(daily.report&&daily.version)for(const topic of daily.report.topics.slice(0,10))refs.push({kind:'daily',date:day,topicId:topic.id,version:daily.version.version});
  const hourly=hourlyBrowse({date:day,limit:'60'});
  if(hourly.snapshot)for(const item of hourly.items)refs.push({kind:'hourly',snapshot:hourly.snapshot.date,version:hourly.snapshot.version,key:item.key});
  for(const ref of refs){
   const source=loadTopicShareSource(ref);
   candidates.push({id:source.sourceKey,ref:source.ref,title:source.title,date:source.date,rank:source.rank,recommendation:recommendTopic(source)});
   identities.set(source.sourceKey,{topicId:source.topicId,urls:source.links.flatMap(link=>{
    try{const url=new URL(link.url);if(url.pathname==='/'||url.hostname==='s.weibo.com'||url.hostname.endsWith('baidu.com')&&url.pathname==='/s')return [];return [url.origin+url.pathname.replace(/\/$/,'')+url.search];}catch{return [];}
   })});
  }
 }
 const choose=(language:'english'|'chinese')=>{
  const sorted=[...candidates].sort((a,b)=>b.recommendation[language].score-a.recommendation[language].score||b.date.localeCompare(a.date)||a.rank-b.rank);
  const unique=new Map<string,TopicShareCandidate>(),topicIds=new Set<string>(),urls=new Set<string>();
  for(const candidate of sorted){
   const key=normalizeTitle(candidate.title)||candidate.title,identity=identities.get(candidate.id)!;
   if(unique.has(key)||topicIds.has(identity.topicId)||identity.urls.some(url=>urls.has(url)))continue;
   unique.set(key,candidate);topicIds.add(identity.topicId);identity.urls.forEach(url=>urls.add(url));
  }
  const pool=[...unique.values()],selected:TopicShareCandidate[]=[];
  for(const candidate of pool){
   if(selected.length===3)break;
   if(selected.some(item=>item.recommendation.column===candidate.recommendation.column)&&pool.some(item=>!selected.includes(item)&&!selected.some(s=>s.recommendation.column===item.recommendation.column)&&item.recommendation[language].score>=candidate.recommendation[language].score-8))continue;
   selected.push(candidate);
  }
  for(const candidate of pool)if(selected.length<3&&!selected.includes(candidate))selected.push(candidate);
  return selected;
 };
 return {english:choose('english'),chinese:choose('chinese'),cadence:{dailyImages:4,storiesMin:2,storiesMax:3},window:{start:days[1],end:date},basis:'编辑优先级估计，结合已保存内容与证据完整度；不是爆款概率或 X 实时趋势。'};
}
