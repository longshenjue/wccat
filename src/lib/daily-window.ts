import { getChinaDate } from './date';

export function parseDailyReportDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日报日期无效。');
  const cutoff = new Date(`${value}T02:00:00+08:00`);
  if (!Number.isFinite(cutoff.getTime()) || getChinaDate(cutoff) !== value) throw new Error('日报日期无效。');
  return cutoff;
}

/** Latest completed 02:00 Beijing cutoff, also used by manual daily generation. */
export function getDailyReportWindow(now = new Date()) {
  const end = new Date(`${getChinaDate(now)}T02:00:00+08:00`);
  if (end.getTime() > now.getTime()) end.setUTCDate(end.getUTCDate() - 1);
  return { start: new Date(end.getTime() - 86400000), end, reportDate: getChinaDate(end) };
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
