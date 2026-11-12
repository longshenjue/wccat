/** Restrict reports to actual collection times, including when hourly collection has gaps. */
export function selectDailySnapshots<T extends { generatedAt: string }>(snapshots: T[], now: Date): T[] {
  const end = now.getTime();
  const start = end - 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const time = Date.parse(snapshot.generatedAt);
    return time > start && time <= end;
  });
}
