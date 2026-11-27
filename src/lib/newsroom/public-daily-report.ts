import type {DailyReportTopic,WccatDailyReport} from '../daily-report';

function publicTopic(topic:DailyReportTopic):DailyReportTopic {
 const result={...topic};
 delete result.research;
 delete result.assetWarnings;
 if(result.relatedDevelopments)result.relatedDevelopments=result.relatedDevelopments.map(publicTopic);
 return result;
}

/** Private research is for generation/admin; readers receive only published copy and media. */
export function publicDailyReport(report:WccatDailyReport):WccatDailyReport {
 return {...report,shareEnglish:undefined,shareEn:undefined,topics:report.topics.map(publicTopic)};
}
