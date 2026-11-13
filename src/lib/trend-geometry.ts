import type {TrendPoint} from './admin-browse-types';
export function sampleTime(key:string) {return Date.parse(key.slice(0,10)+'T'+key.slice(11)+':00:00+08:00');}
export function trendGeometry(points:TrendPoint[],metric:'rank'|'heatScore',width:number,date:string,days:number) {
 const left=48,right=16,top=18,bottom=145;
 const end=Date.parse(date+'T00:00:00+08:00')+86400000,start=end-days*86400000;
 const matched=points.filter(point=>point.status==='matched'&&point[metric]!==null&&Number.isFinite(point[metric]));
 const maximum=Math.max(metric==='rank'?2:1,...matched.map(point=>point[metric]!));
 const max=metric==='rank'?maximum:maximum*1.1;
 const x=(time:number)=>left+(time-start)/(end-start)*(width-left-right);
 const y=(value:number)=>metric==='rank'?top+(value-1)/(max-1)*(bottom-top):bottom-value/max*(bottom-top);
 const dots=matched.map(point=>({point,x:x(sampleTime(point.snapshotDate)),y:y(point[metric]!)}));
 const segments:Array<{x1:number;y1:number;x2:number;y2:number;dashed:boolean}>=[];
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i];
  if(a.status!=='matched'||b.status!=='matched'||a[metric]===null||b[metric]===null)continue;
  segments.push({x1:x(sampleTime(a.snapshotDate)),y1:y(a[metric]!),x2:x(sampleTime(b.snapshotDate)),y2:y(b[metric]!),dashed:sampleTime(b.snapshotDate)-sampleTime(a.snapshotDate)>4*3600000});
 }
 const ticks=[...new Set(Array.from({length:4},(_,i)=>metric==='rank'?Math.round(1+(max-1)*i/3):Math.round(max*i/3)))].map(value=>({value,y:y(value)}));
 const count=width<420?3:5;
 const timeTicks=Array.from({length:count},(_,i)=>{const time=start+(end-start)*i/(count-1);return {time,x:x(time)};});
 return {dots,segments,ticks,timeTicks,width,height:185,left,right,top,bottom};
}
