import {getDb} from './db';
import {normalizeTitle} from './normalize';
import {resolveSnapshots,resolveReport,sourceDb,publicVersion,versionOf} from './snapshot-reader';
import type {HourlyBrowseResult,ItemDetail,TopicTrend,DailyBrowseResult,BrowseItem} from './admin-browse-types';
import type {RawHotItem,TopicGroup} from './types';
import type {TopicAnalysis} from './topic-analysis';

type Query=Record<string,string|undefined>;
export class BrowseError extends Error {constructor(message:string,public status=400){super(message);}}
export function browseDate(value:unknown) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new BrowseError('日期无效。');
 // Parsing calendar validity only; historical queries may legitimately be empty.
 const parsed=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new BrowseError('日期无效。');
 return value;
}
function integer(value:string|undefined,fallback:number,max:number) {
 if(value===undefined)return fallback;
 if(!/^[1-9]\d*$/.test(value)||Number(value)>max)throw new BrowseError('分页参数无效。');
 return Number(value);
}
function selected(query:Query) {
 const id=query.snapshot;
 if(!id||!/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(id)||Number(id.slice(11))>23)throw new BrowseError('采样标识无效。');
 browseDate(id.slice(0,10));
 const row=resolveSnapshots(id,id)[0];
 if(!row||!query.version||query.version!==versionOf(row))throw new BrowseError('数据版本已更新或不可用，请重新选择采样。',409);
 return row;
}
function readItem(query:Query):ItemDetail {
 const row=selected(query),db=sourceDb(row.source),key=query.key??'';
 if(!/^[tr]:\d+$/.test(key)||key.length>24)throw new BrowseError('条目标识无效。');
 const index=Number(key.slice(2));
 if(!Number.isSafeInteger(index))throw new BrowseError('条目标识无效。');
 if(key.startsWith('t:')) {
  const item=db.prepare('select payload from topics where snapshot_date=? and id=?').get(row.date,index) as {payload:string}|undefined;
  if(!item)throw new BrowseError('条目不存在。',404);
  const topic=JSON.parse(item.payload) as TopicGroup;
  const analysis=db.prepare('select payload from topic_analyses where snapshot_date=? and topic_id=?').get(row.date,topic.id) as {payload:string}|undefined;
  return {snapshot:publicVersion(row),kind:'topics',key,item:topic,analysis:analysis?JSON.parse(analysis.payload) as TopicAnalysis:undefined};
 }
 const item=db.prepare('select json_extract(payload,?) as item from snapshots where date=?').get(`$.rawItems[${index}]`,row.date) as {item:string|null};
 if(!item?.item)throw new BrowseError('条目不存在。',404);
 const raw=JSON.parse(item.item) as RawHotItem;
 const linked=db.prepare("select distinct t.id from topics t,json_each(t.payload,'$.occurrences') o where t.snapshot_date=? and json_extract(o.value,'$.sourceId')=? and json_extract(o.value,'$.url')=? and json_extract(o.value,'$.title')=? limit 2")
  .all(row.date,raw.sourceId,raw.url,raw.title) as {id:number}[];
 return {snapshot:publicVersion(row),kind:'raw',key,item:raw,linkedTopicKey:linked.length===1?'t:'+linked[0].id:undefined};
}
export function browseItem(query:Query):ItemDetail {return getDb().transaction(()=>readItem(query)).deferred();}

export function hourlyBrowse(query:Query):HourlyBrowseResult {
 return getDb().transaction(()=>{
  const date=browseDate(query.date),page=integer(query.page,1,100000),limit=integer(query.limit,20,100);
  if(query.snapshot&&(!/^\d{4}-\d{2}-\d{2}-(?:[01]\d|2[0-3])$/.test(query.snapshot)||query.snapshot.slice(0,10)!==date))throw new BrowseError('采样与日期参数不匹配。');
  if(query.kind&&query.kind!=='topics'&&query.kind!=='raw')throw new BrowseError('条目类型参数无效。');
  const kind:'topics'|'raw'=query.kind==='raw'?'raw':'topics';
  if((query.search?.length??0)>200||(query.source?.length??0)>100)throw new BrowseError('筛选参数过长。');
  const versions=resolveSnapshots(date+'-00',date+'-23'),row=query.snapshot?versions.find(value=>value.date===query.snapshot):versions.at(-1);
  if(query.snapshot&&!row&&versions.length)throw new BrowseError('所选采样不属于当前日期或已不可用。',404);
  if(query.version&&(!row||query.version!==versionOf(row)))throw new BrowseError('数据版本已更新，请重新选择采样后翻页。',409);
  const base={snapshots:versions.map(publicVersion),snapshot:row?publicVersion(row):null,items:[] as BrowseItem[],total:0,page,limit,kind,sources:[] as {id:string;name:string}[]};
  if(!row)return base;
  const db=sourceDb(row.source),search=(query.search??'').trim(),source=query.source??'';
  base.sources=db.prepare('select distinct source_id as id,source_name as name from raw_items where snapshot_date=? order by source_name').all(row.date) as {id:string;name:string}[];
  const params:Array<string|number>=[row.date];
  let from:string,fields:string,order:string;
  if(kind==='topics') {
   from='topics t where t.snapshot_date=?';
   if(search){from+=' and instr(lower(t.title),lower(?))>0';params.push(search);}
   if(source){from+=" and exists(select 1 from json_each(t.payload,'$.occurrences') o where json_extract(o.value,'$.sourceId')=?)";params.push(source);}
   fields="t.id,t.title,t.rank,t.heat_score as heat,json_extract(t.payload,'$.sources') as sources,(select a.model from topic_analyses a where a.snapshot_date=t.snapshot_date and a.topic_id=t.topic_id) as model";
   order='t.rank,t.id';
  }else {
   from="snapshots s,json_each(s.payload,'$.rawItems') j where s.date=?";
   if(search){from+=" and instr(lower(json_extract(j.value,'$.title')),lower(?))>0";params.push(search);}
   if(source){from+=" and json_extract(j.value,'$.sourceId')=?";params.push(source);}
   fields="j.key as id,json_extract(j.value,'$.title') as title,json_extract(j.value,'$.rank') as rank,json_extract(j.value,'$.heatValue') as heat,json_extract(j.value,'$.heatText') as heatText,json_array(json_extract(j.value,'$.sourceName')) as sources";
   order="json_extract(j.value,'$.sourceId'),rank,j.key";
  }
  base.total=(db.prepare('select count(*) as n from '+from).get(...params) as {n:number}).n;
  const rows=db.prepare('select '+fields+' from '+from+' order by '+order+' limit ? offset ?').all(...params,limit,(page-1)*limit) as {id:number;title:string;rank:number;heat:number|null;heatText?:string;sources:string;model?:string}[];
  base.items=rows.map(item=>({key:(kind==='topics'?'t:':'r:')+item.id,title:item.title,rank:item.rank,heat:item.heat,heatText:item.heatText,sources:JSON.parse(item.sources??'[]'),analysisModel:item.model}));
  return base;
 }).deferred();
}

function fullTitle(value:string) {return value.replace(/[\p{Punctuation}\p{White_Space}]+/gu,'').toLowerCase();}
export function topicTrend(query:Query):TopicTrend {
 return getDb().transaction(()=>{
  const anchor=readItem(query);
  if(anchor.kind!=='topics')throw new BrowseError('请选择聚合话题查看热度变化。');
  const topic=anchor.item as TopicGroup,date=browseDate(query.date),days=Number(query.days??'1');
  if(!['1','7','30'].includes(query.days??'1'))throw new BrowseError('趋势范围参数无效。');
  const start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
  const versions=resolveSnapshots(start.toISOString().slice(0,10)+'-00',date+'-23');
  const matches=new Map<string,Array<{id:number;title:string;normalized:string;heat:number;rank:number;count:number}>>();
  // Metadata chooses the winning source first; query only this topic's scalars per relevant source.
  const sources=new Map(versions.map(row=>[row.source.id,row.source]));
  for(const source of sources.values()) {
   const rows=sourceDb(source).prepare("select id,snapshot_date,title,json_extract(payload,'$.normalizedTitle') as normalized,heat_score as heat,rank,json_array_length(payload,'$.sources') as count from topics where snapshot_date>=? and snapshot_date<=? and topic_id=?")
    .all(start.toISOString().slice(0,10)+'-00',date+'-23',topic.id) as {id:number;snapshot_date:string;title:string;normalized:string;heat:number;rank:number;count:number}[];
   for(const item of rows) {
    if(!versions.some(version=>version.date===item.snapshot_date&&version.source.id===source.id))continue;
    const canonical=normalizeTitle(item.normalized||item.title),expected=normalizeTitle(topic.normalizedTitle||topic.title);
    if(!canonical||canonical!==expected||!fullTitle(topic.title)||fullTitle(item.title)!==fullTitle(topic.title))continue;
    const values=matches.get(item.snapshot_date)??[];values.push(item);matches.set(item.snapshot_date,values);
   }
  }
  return {title:topic.title,date,days,points:versions.map(row=>{
   const candidates=matches.get(row.date)??[],item=candidates.length===1?candidates[0]:undefined;
   const valid=item&&Number.isFinite(item.heat)&&Number.isFinite(item.rank)&&item.rank>=1;
   return {snapshotDate:row.date,generatedAt:row.generatedAt,version:versionOf(row),itemKey:valid?'t:'+item.id:undefined,heatScore:valid?item.heat:null,rank:valid?item.rank:null,sourceCount:valid?item.count:null,status:valid?'matched' as const:candidates.length>1?'ambiguous' as const:'unmatched' as const};
  })};
 }).deferred();
}
export function dailyBrowse(value:unknown):DailyBrowseResult {
 return getDb().transaction(()=>{
  const date=browseDate(value),row=resolveReport(date);
  if(!row)return {report:null,version:null};
  const result=sourceDb(row.source).prepare('select payload from daily_reports where report_date=?').get(date) as {payload:string};
  return {report:JSON.parse(result.payload),version:publicVersion(row)};
 }).deferred();
}
