import type {WccatDailyReport} from '../daily-report';
import type {ShareEnCopy} from '../shareen-types';
import {getDailyCardBattle} from '../daily-bilingual-cards';
import type {ShareLanguage} from '../daily-share-copy';
import {visibleCommentQuotes} from './selection';
import {topicReaderComments} from '../topic-sharing/readers';
export function shareEnCommentSource(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'){
 const id=index>0?copy.highlights?.[index-1]?.topicId:undefined;
 const topic=id?report.topics.find(t=>t.id===id):undefined,analysis=topic?.aiAnalysis;
 const observations=topicReaderComments(topic??{});
 if(observations.length)return {examples:analysis?.commentExamples,battle:analysis?.battle,observations};
 if(!analysis||!getDailyCardBattle(report,copy,index,language))return undefined;
 return {examples:analysis.commentExamples,battle:analysis.battle,observations};
}
export function shareEnCommentRows(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'){
 const source=shareEnCommentSource(report,copy,index,language);
 return source?.observations.length?source.observations.map(quote=>({side:quote.side??'neutral' as const,quote,text:language==='en'?quote.englishText??quote.text:quote.text})):source?visibleCommentQuotes(source.examples,source.battle,language):[];
}
export function shareEnCanvasHeight(report:WccatDailyReport,copy:ShareEnCopy,index:number,language:ShareLanguage='en'){
 const count=shareEnCommentRows(report,copy,index,language).length;
 return count?1600+300*count:1500;
}
