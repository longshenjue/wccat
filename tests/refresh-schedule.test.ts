import test from 'node:test';
import assert from 'node:assert/strict';
import {msUntilNextRefresh,msUntilNextChinaTime} from '../src/lib/date';

test('refreshes on four-hour Beijing boundaries independently of host timezone',()=>{
 for(const [current,next] of [
  ['2026-11-13T00:00:00+08:00','2026-11-13T04:00:00+08:00'],
  ['2026-11-13T03:59:59.500+08:00','2026-11-13T04:00:00+08:00'],
  ['2026-11-13T04:01:00+08:00','2026-11-13T08:00:00+08:00'],
  ['2026-11-13T14:20:00+08:00','2026-11-13T16:00:00+08:00'],
  ['2026-11-13T20:00:00+08:00','2026-11-14T00:00:00+08:00'],
  ['2026-11-13T23:59:59.999+08:00','2026-11-14T00:00:00+08:00']
 ])assert.equal(msUntilNextRefresh(new Date(current)),Date.parse(next)-Date.parse(current));
 assert.equal(msUntilNextChinaTime(2,0,new Date('2026-11-13T00:00:00+08:00')),7200000);
 assert.equal(msUntilNextChinaTime(2,0,new Date('2026-11-13T02:00:00+08:00')),86400000);
});
