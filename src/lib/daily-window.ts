import { getChinaDate } from './date';

/** A report's content date D ends at 02:00 Beijing on D+1. */
export function parseDailyReportDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日报日期无效。');
  const cutoff = new Date(`${value}T02:00:00+08:00`);
  if (!Number.isFinite(cutoff.getTime()) || getChinaDate(cutoff) !== value) throw new Error('日报日期无效。');
  cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  return cutoff;
}

/** Latest completed window, named for its starting (content) date. */
export function getDailyReportWindow(now = new Date()) {
  const end = new Date(`${getChinaDate(now)}T02:00:00+08:00`);
  if (end.getTime() > now.getTime()) end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime() - 86400000);
  return { start, end, reportDate: getChinaDate(start) };
}

/** Actual collection times in (start, end]; adjacent reports never double-count a boundary. */
export function selectDailySnapshots<T extends { generatedAt: string }>(snapshots: T[], now: Date): T[] {
  const end = now.getTime();
  const start = end - 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const time = Date.parse(snapshot.generatedAt);
    return time > start && time <= end;
  });
}
