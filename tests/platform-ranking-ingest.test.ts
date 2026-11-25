import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSource} from '../src/lib/ingest';
import {getSourceById} from '../src/lib/sources';
import {withEvidenceCapture} from '../src/lib/evidence-capture';
import {scorePlatformItems} from '../src/lib/platform-ranking';

test('ingestion preserves observed zero counters for within-platform percentiles without filling missing counters',async t=>{
 const old=globalThis.fetch;t.after(()=>{globalThis.fetch=old;});
 globalThis.fetch=async()=>Response.json({data:{list:Array.from({length:10},(_,index)=>({
  title:`真实互动示例${index}`,bvid:`BVexample${index}`,stat:{like:index?index*10:'0',reply:index*10}
 }))}});
 const items=await withEvidenceCapture(()=>{},()=>fetchSource(getSourceById('bilibili')!,{tianapi:null}));
 assert.equal(items.length,10);
 assert.equal(items[0].stats?.likes,0);assert.equal(items[0].stats?.comments,0);assert.equal(items[0].stats?.replies,0);
 assert.equal(items[0].stats?.danmaku,undefined);
 const scored=scorePlatformItems(items);
 assert.equal(scored[0].platformScoring?.strength,.62);
 assert.ok(scored[9].platformScore>scored[0].platformScore);
});
