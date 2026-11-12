import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDailySnapshots } from '../src/lib/daily-window';

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
