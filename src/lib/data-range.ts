import {getChinaDate} from './date';
export type DateRange={start:string;end:string};
export function parseRange(input:unknown):DateRange{
 const value=input as Record<string,unknown>;
 if(!value||typeof value.start!=='string'||typeof value.end!=='string')throw new Error('请选择开始和结束日期。');
 for(const day of [value.start,value.end]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00+08:00'))||getChinaDate(new Date(day+'T00:00:00+08:00'))!==day)throw new Error('日期无效。');
 }
 if(value.start>value.end||Date.parse(value.end)-Date.parse(value.start)>3660*86400000)throw new Error('日期范围无效或超过10年。');
 return {start:value.start,end:value.end};
}
export function nextDay(day:string){
 return new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
}
export function splitMonths(range:DateRange){
 const result:DateRange[]=[];let start=range.start;
 while(start<=range.end){
  const monthEnd=new Date(Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7)),0)).toISOString().slice(0,10);
  const end=monthEnd<range.end?monthEnd:range.end;result.push({start,end});start=nextDay(end);
 }return result;
}

