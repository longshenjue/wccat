import type {WccatDailyReport} from '../daily-report';
import type {ShareEnCopy} from '../shareen-types';
import {getDailyCardBattle} from '../daily-bilingual-cards';
import type {ShareLanguage} from '../daily-share-copy';
import {visibleCommentQuotes} from './selection';
export function shareEnCommentSource(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'){
 const id=index>0?copy.highlights?.[index-1]?.topicId:undefined;
 const analysis=id?report.topics.find(t=>t.id===id)?.aiAnalysis:undefined;
 if(!analysis||!getDailyCardBattle(report,copy,index,language))return undefined;
 return {examples:analysis.commentExamples,battle:analysis.battle};
}
export function shareEnCanvasHeight(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'){
 const source=shareEnCommentSource(report,copy,index,language);
 const count=source?visibleCommentQuotes(source.examples,source.battle,language).length:0;
 return count?1600+300*count:1500;
}
