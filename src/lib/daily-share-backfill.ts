import { readDailyReportFromDb, readLatestDailyReportFromDb, saveDailyShareEnglishToDb, writeGeneration } from './db';
import { getDailyShareCopy } from './daily-share-copy';
import { translateDailyShare } from './daily-share-translation';

/** Shell maintenance only; never exposed as a public AI-triggering endpoint. */
export async function backfillDailyShareEnglish(reportDate?: string) {
  const generation = writeGeneration();
  const report = reportDate ? readDailyReportFromDb(reportDate) : readLatestDailyReportFromDb();
  if (!report) throw new Error(`Daily report not found: ${reportDate ?? 'latest'}`);
  if (!report.topics.length) throw new Error('Daily report has no topics to translate.');

  if (report.shareEnglish) {
    try {
      getDailyShareCopy(report, 'en');
      return { reportDate: report.reportDate, status: 'cached' as const };
    } catch {
      // Invalid legacy copies may be repaired without regenerating the Chinese report.
    }
  }
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('Missing runtime DEEPSEEK_API_KEY.');
  const shareEnglish = await translateDailyShare(report);
  if (!shareEnglish) throw new Error('English translation failed; see the translation error above.');
  if (!saveDailyShareEnglishToDb({ ...report, shareEnglish }, generation)) {
    throw new Error('Daily report changed during translation; rerun the command for the latest version.');
  }
  return { reportDate: report.reportDate, status: 'generated' as const };
}
