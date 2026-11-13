import test from 'node:test';
import assert from 'node:assert/strict';
import type {TrendPoint} from '../src/lib/admin-browse-types';
test('trend geometry inverts ranks, breaks unmatched observations and marks long observed intervals',async()=>{
 const {trendGeometry}=await import('../src/lib/trend-geometry');
 const point=(hour:string,rank:number|null):TrendPoint=>({snapshotDate:'2025-09-01-'+hour,generatedAt:'2025-09-01T00:00:00Z',version:'v',rank,heatScore:rank===null?null:100,sourceCount:1,status:rank===null?'unmatched':'matched'});
 const values=[point('00',1),point('04',3),point('08',null),point('12',2),point('20',1)];
 const rank=trendGeometry(values,'rank',350,'2025-09-01',1);
 assert.ok(rank.dots[0].y<rank.dots[1].y);
 assert.equal(rank.dots.length,4);
 assert.equal(rank.segments.length,2);
 assert.equal(rank.segments[1].dashed,true);
 assert.equal(trendGeometry([values[0]],'heatScore',350,'2025-09-01',1).segments.length,0);
});
