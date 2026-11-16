import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {validateShareEn,sourceFingerprint} from '../src/lib/shareen';
import type {ShareEnCopy} from '../src/lib/shareen-types';
import {shareEnImage} from '../src/lib/shareen-media';

test('focus card images reuse original covers and approved admin overrides',async()=>{
 const report=fixture('2026-11-15');report.topics=[...report.topics,{...report.topics[0],id:'second',rank:2}];
 report.topics[0].cover='https://p1.img.cctvpic.com/example.jpg';
 // An unsupported source is explicitly unavailable; it cannot bypass the existing proxy allowlist.
 const copy:ShareEnCopy=await savedShareEnFixture(report);
 assert.equal(shareEnImage(report,copy,0),undefined);
 assert.equal(shareEnImage(report,copy,1),undefined);
 report.topics[0].cover='https://i0.hdslb.com/bfs/archive/source.jpg';report.topics[0].coverSourceId='bilibili';
 const original=shareEnImage(report,copy,1)!;
 assert.equal(new URL(original.src,'http://localhost').searchParams.get('url'),report.topics[0].cover);
 assert.equal(new URL(original.src,'http://localhost').searchParams.get('source'),'bilibili');
 assert.ok(original.alt.includes(copy.highlights[0].hook));
 copy.highlights[0].imageUrl='https://pic1.zhimg.com/replacement.jpg';
 assert.equal(shareEnImage(report,copy,1)!.url,copy.highlights[0].imageUrl);
 copy.sourceFingerprint=sourceFingerprint(report);
 copy.highlights[0].hideImage=true;assert.equal(shareEnImage(report,copy,1),undefined);
 copy.highlights[0].hideImage=false;
 const valid=validateShareEn(copy,report);assert.equal(valid.highlights[0].imageUrl,copy.highlights[0].imageUrl);
 for(const url of ['http://127.0.0.1/private','https://bad.example/a.png','javascript:alert(1)','/api/image?url=http://localhost/private']){
  copy.highlights[0].imageUrl=url;
  assert.throws(()=>validateShareEn(copy,report),/image|url/i);
  assert.equal(shareEnImage(report,copy,1),undefined);
 }
 delete copy.highlights[0].imageUrl;
 report.topics[0].cover='/api/image?source=bilibili&url='+encodeURIComponent('https://i0.hdslb.com/bfs/archive/source.jpg');
 assert.equal(shareEnImage(report,copy,1)!.src,report.topics[0].cover);
});
