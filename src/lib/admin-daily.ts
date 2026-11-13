import {readDailyReportFromDb,readRecentSnapshotsFromDb} from './db';
import {getChinaSnapshotId} from './date';
import {getDailyReportWindow,parseDailyReportDate,selectDailySnapshots} from './daily-window';

export function dailyGenerationPreview(value:unknown,now=new Date()) {
 const cutoff=parseDailyReportDate(value,now);
 const {start,end,reportDate}=getDailyReportWindow(cutoff);
 const snapshots=selectDailySnapshots(readRecentSnapshotsFromDb(25,getChinaSnapshotId(end)),end);
 const existing=readDailyReportFromDb(reportDate);
 return {
  reportDate,windowStart:getChinaSnapshotId(start),windowEnd:getChinaSnapshotId(end),
  snapshotCount:snapshots.length,hasTopics:snapshots.some(snapshot=>snapshot.topics.length>0),
  existing:Boolean(existing),existingGeneratedAt:existing?.generatedAt,
  firstCollectedAt:snapshots[0]?.generatedAt,lastCollectedAt:snapshots.at(-1)?.generatedAt
 };
}

export function requireDailyGenerationData(value:unknown) {
 const preview=dailyGenerationPreview(value);
 if(!preview.snapshotCount||!preview.hasTopics) throw new Error('该统计窗口没有有效快照或话题，不能生成或覆盖日报。');
 return preview;
}

export type DailyGenerationPreview = ReturnType<typeof dailyGenerationPreview>;
