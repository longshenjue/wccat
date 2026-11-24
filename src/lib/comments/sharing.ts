import type {WccatDailyReport} from '../daily-report';
import type {ShareEnCopy} from '../shareen-types';
import {getShareEnBattle} from '../shareen-battle';
import {visibleCommentQuotes} from './selection';
export function shareEnCommentSource(report:WccatDailyReport,copy:ShareEnCopy,index:number){
 const id=index>0?copy.highlights?.[index-1]?.topicId:undefined;
 const analysis=id?report.topics.find(t=>t.id===id)?.aiAnalysis:undefined;
 if(!analysis||!getShareEnBattle(report,copy,index))return undefined;
 return {examples:analysis.commentExamples,battle:analysis.battle};
}
export function shareEnCanvasHeight(report:WccatDailyReport,copy:ShareEnCopy,index:number){
 const source=shareEnCommentSource(report,copy,index);
 const count=source?visibleCommentQuotes(source.examples,source.battle,'en').length:0;
 return count?1600+300*count:1500;
}
