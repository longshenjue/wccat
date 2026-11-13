import test from 'node:test';
import assert from 'node:assert/strict';
import { report, snapshot, testDatabase } from './helpers/data-fixtures';
import { getChinaSnapshotId } from '../src/lib/date';

test('daily persistence handles four-hour samples and legacy hourly samples without calling them elapsed hours', async () => {
 const db = await testDatabase();
 const previousKey = process.env.DEEPSEEK_API_KEY;
 const previousFetch = globalThis.fetch;
 delete process.env.DEEPSEEK_API_KEY;
 globalThis.fetch = async () => { throw new Error('No network calls allowed in daily-window regression'); };
 try {
  const { buildDailyTopTopics } = await import('../src/lib/daily-report');
  const samples = (step: number, count: number) => Array.from({length:count}, (_, index) =>
   snapshot(`2026-11-13-${String(index * step).padStart(2, '0')}`));
  const fourHourly = buildDailyTopTopics(samples(4, 6))[0];
  assert.equal(fourHourly.sampleCount, 6);
  assert.equal(fourHourly.sampleCoverage, 1);
  assert.equal(fourHourly.signal, 'dominant');
  const withManualSample = [...samples(4, 6), snapshot('2026-11-13-03')];
  assert.equal(buildDailyTopTopics(withManualSample)[0].signal, 'dominant');
  const hourly = buildDailyTopTopics(samples(1, 24))[0];
  assert.equal(hourly.sampleCount, 24);
  assert.equal(hourly.sampleCoverage, 1);
  assert.equal(hourly.signal, 'dominant');
  assert.equal(buildDailyTopTopics(samples(4, 1))[0].signal, 'long-tail');
  const intermittent = samples(4, 6);
  intermittent.forEach((sample, index) => { if(index > 1) sample.topics = []; });
  const partial = buildDailyTopTopics(intermittent)[0];
  assert.equal(partial.sampleCount, 2);
  assert.equal(partial.sampleCoverage, 1/3);
  assert.equal(partial.signal, 'dominant');
  intermittent[1].topics = [];
  assert.equal(buildDailyTopTopics(intermittent)[0].signal, 'long-tail');

  // Both boundary hour keys can contribute: > yesterday 02:00, <= today 02:00.
  const analysis = report('2026-11-13').topics[0].aiAnalysis!;
  for (let index = 0; index <= 24; index++) {
   const time = new Date(Date.parse('2026-11-12T02:30:00+08:00') + index * 3600000);
   if (index === 24) time.setTime(Date.parse('2026-11-13T02:00:00+08:00'));
   const id = getChinaSnapshotId(time);
   db.saveSnapshotToDb(snapshot(id, time.toISOString()));
   db.saveTopicAnalysisToDb(id, 'topic-one', analysis);
  }
  // A later manual run must not let post-cutoff snapshots push out eligible data.
  db.saveSnapshotToDb(snapshot('2026-11-13-14', '2026-11-13T06:00:00Z'));
  const { generateDailyReport } = await import('../src/lib/daily-report');
  const daily = await generateDailyReport(new Date('2026-11-13T15:00:00+08:00'));
  assert.equal(daily.reportDate, '2026-11-12');
  assert.equal(daily.windowStart, '2026-11-12-02');
  assert.equal(daily.windowEnd, '2026-11-13-02');
  assert.equal(daily.topics[0].sampleCount, 25);
  assert.match(daily.overview, /25 次采样/);
  assert.doesNotMatch(daily.wechatDraft, /持续 \d+ 小时/);
 } finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = previousKey;
  db.close();
 }
});
