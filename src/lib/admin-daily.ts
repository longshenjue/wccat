import {readDailyReportFromDb} from './db';
import {getChinaSnapshotId} from './date';
import {parseDailyReportDate} from './daily-window';
import {readDailyReportInput} from './daily-report-input';

export function dailyGenerationPreview(value:unknown,now=new Date()) {
 const cutoff=parseDailyReportDate(value);
 const {start,end,reportDate,snapshots,collection}=readDailyReportInput(cutoff,now);
 const existing=readDailyReportFromDb(reportDate);
 return {
  reportDate,windowStart:getChinaSnapshotId(start),windowEnd:getChinaSnapshotId(end),
  snapshotCount:snapshots.length,hasTopics:snapshots.some(snapshot=>snapshot.topics.length>0),
  existing:Boolean(existing),existingGeneratedAt:existing?.generatedAt,
  ...collection
 };
}

export function requireDailyGenerationData(value:unknown) {
 const preview=dailyGenerationPreview(value);
 if(!preview.snapshotCount||!preview.hasTopics) throw new Error('该统计窗口没有有效快照或话题，不能生成或覆盖日报。');
 return preview;
}

export type DailyGenerationPreview = ReturnType<typeof dailyGenerationPreview>;
