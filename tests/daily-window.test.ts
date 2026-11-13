import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyReportWindow, parseDailyReportDate, selectDailySnapshots } from '../src/lib/daily-window';

test('daily window excludes stale, invalid, future, and exact 24-hour-boundary snapshots', () => {
 const now = new Date('2026-11-12T07:30:00Z');
 const samples = [
  {generatedAt:'2026-06-23T06:00:00Z'},
  {generatedAt:'2026-11-11T07:30:00Z'},
  {generatedAt:'2026-11-11T08:00:00Z'},
  {generatedAt:'2026-11-12T07:30:00Z'},
  {generatedAt:'2026-11-12T08:00:00Z'},
  {generatedAt:'invalid'}
 ];
 assert.deepEqual(selectDailySnapshots(samples, now), [samples[2], samples[3]]);
});

test('daily reports use the last completed 02:00 Beijing window, including month rollover', () => {
 for (const [now, end, reportDate] of [
  ['2026-11-14T02:00:00+08:00', '2026-11-14T02:00:00+08:00', '2026-11-13'],
  ['2026-11-13T02:00:00+08:00', '2026-11-13T02:00:00+08:00', '2026-11-12'],
  ['2026-11-13T17:30:00+08:00', '2026-11-13T02:00:00+08:00', '2026-11-12'],
  ['2026-11-13T01:59:59+08:00', '2026-11-12T02:00:00+08:00', '2026-11-11'],
  ['2026-12-01T02:00:00+08:00', '2026-12-01T02:00:00+08:00', '2026-11-30'],
  ['2027-01-01T02:00:00+08:00', '2027-01-01T02:00:00+08:00', '2026-12-31']
 ]) {
  const window = getDailyReportWindow(new Date(now));
  assert.equal(window.end.getTime(), Date.parse(end));
  assert.equal(window.end.getTime() - window.start.getTime(), 86400000);
  assert.equal(window.reportDate, reportDate);
 }
 const { end } = getDailyReportWindow(new Date('2026-11-13T15:00:00+08:00'));
 const samples = ['2026-11-12T02:00:00+08:00','2026-11-12T04:00:00+08:00',
  '2026-11-13T00:00:00+08:00','2026-11-13T01:59:59+08:00',
  '2026-11-13T02:00:00+08:00','2026-11-13T02:00:01+08:00']
  .map(generatedAt => ({generatedAt}));
 assert.deepEqual(selectDailySnapshots(samples, end), samples.slice(1, 5));
});

test('selecting a content date uses that day at 02:00 through the next day at 02:00', () => {
 for (const [date, start, end] of [
  ['2026-11-13', '2026-11-13T02:00:00+08:00', '2026-11-14T02:00:00+08:00'],
  ['2026-11-30', '2026-11-30T02:00:00+08:00', '2026-12-01T02:00:00+08:00'],
  ['2026-12-31', '2026-12-31T02:00:00+08:00', '2027-01-01T02:00:00+08:00'],
  ['2028-02-29', '2028-02-29T02:00:00+08:00', '2028-03-01T02:00:00+08:00']
 ]) {
  const window = getDailyReportWindow(parseDailyReportDate(date));
  assert.equal(window.reportDate, date);
  assert.equal(window.start.getTime(), Date.parse(start));
  assert.equal(window.end.getTime(), Date.parse(end));
 }
});
