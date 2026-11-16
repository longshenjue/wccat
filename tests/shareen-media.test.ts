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
 assert.equal(shareEnImage(report,copy,1)!.src,report.topics[0].cover+'&mode=shareen');
});

import * as media from '../src/lib/shareen-media';
import type {ShareEnImageAsset} from '../src/lib/shareen-image-types';

function imageAsset(overrides:Partial<ShareEnImageAsset>={}):ShareEnImageAsset {
 return {version:1,id:'a'.repeat(64),requestKey:'b'.repeat(64),sourceHash:'c'.repeat(64),sourceUrl:'https://i0.hdslb.com/bfs/archive/source.jpg',model:'fixture',policyVersion:'shareen-image-v1',layout:'split',width:400,height:480,sourceWidth:1200,sourceHeight:800,protectedRegions:[],confidence:.4,reason:'Safe full-image fallback',processedAt:'2026-11-16T00:00:00.000Z',mime:'image/webp',...overrides};
}

async function imageFixture(){
 const report=fixture('2026-11-15');report.topics=[...report.topics,{...report.topics[0],id:'second',rank:2}];
 report.topics[0].cover='https://i0.hdslb.com/bfs/archive/source.jpg';report.topics[0].coverSourceId='bilibili';
 const copy:ShareEnCopy=await savedShareEnFixture(report);
 return {report,copy};
}

test('matching processed images select authenticated cached URLs without private data',async()=>{
 const {report,copy}=await imageFixture();
 copy.highlights[0].imageAsset=imageAsset({dataBase64:'c2VjcmV0'});
 const image=media.shareEnImage(report,copy,1)!;
 assert.equal(image.src,`/api/admin/share/image?date=2026-11-15&topicId=topic-one&assetId=${'a'.repeat(64)}`);
 assert.equal(image.url,report.topics[0].cover);
 assert.equal(image.layout,'split');assert.equal(image.processed,true);
 assert.ok(!JSON.stringify(image).includes('c2VjcmV0'));
 assert.deepEqual(media.shareEnOriginalImage(report,copy,1),{url:report.topics[0].cover,sourceId:'bilibili',alt:`Source image for ${copy.highlights[0].hook}`});
});

test('stale, malformed and untrusted src caches use full original image instead',async()=>{
 const {report,copy}=await imageFixture();
 for(const asset of [imageAsset({sourceUrl:'https://pic1.zhimg.com/other.jpg'}),{...imageAsset(),id:'broken'}, {...imageAsset(),layout:'unsafe',src:'https://bad.example/private'}]){
  copy.highlights[0].imageAsset=asset as ShareEnImageAsset;
  const image=media.shareEnImage(report,copy,1)!;
  assert.equal(image.src,'/api/image?source=bilibili&url=https%3A%2F%2Fi0.hdslb.com%2Fbfs%2Farchive%2Fsource.jpg&mode=shareen');
  assert.equal(image.processed,false);assert.equal(image.layout,'wide');
 }
 copy.highlights[0].imageAsset=imageAsset();copy.highlights[0].imageUrl='https://pic1.zhimg.com/replacement.jpg';
 assert.equal(media.shareEnImage(report,copy,1)!.processed,false);
 copy.highlights[0].hideImage=true;
 assert.equal(media.shareEnImage(report,copy,1),undefined);assert.equal(media.shareEnOriginalImage(report,copy,1),undefined);
});

test('split presentation trims generated padding with safety and retains every source pixel',()=>{
 for(const [sourceWidth,sourceHeight,width,height,left,top] of [[1200,800,400,272,0,104],[800,1200,324,480,38,0],[800,800,400,404,0,38],[400,480,400,480,0,0]]){
  const display=media.shareEnSplitDisplay(imageAsset({sourceWidth,sourceHeight}));
  assert.deepEqual(display,{width,height,left,top});
  // Hand-checked geometry: source content bounds stay inside the displayed region.
  const scale=Math.min(400/sourceWidth,480/sourceHeight);
  assert.ok(left<=(400-sourceWidth*scale)/2&&top<=(480-sourceHeight*scale)/2);
  assert.ok(left+width>=(400+sourceWidth*scale)/2&&top+height>=(480+sourceHeight*scale)/2);
 }
});

test('shared validation keeps valid internal image metadata and bytes but drops malformed cache',async()=>{
 const {report,copy}=await imageFixture();
 copy.highlights[0].imageAsset=imageAsset({dataBase64:'c2VjcmV0'});
 assert.deepEqual(validateShareEn(copy,report).highlights[0].imageAsset,copy.highlights[0].imageAsset);
 copy.highlights[0].imageAsset={...imageAsset(),id:'bad'};
 assert.equal(validateShareEn(copy,report).highlights[0].imageAsset,undefined);
});

test('ShareEn excludes generative covers, wrapped covers, overrides and caches even with a publisher source id',async()=>{
 const {report,copy}=await imageFixture();
 const {validateImageAsset}=await import('../src/lib/shareen-image-types');
 for(const generated of ['https://pollinations.ai/prompt/a','https://image.pollinations.ai/prompt/b']){
  report.topics[0].cover=generated;
  assert.equal(media.shareEnOriginalImage(report,copy,1),undefined);
  report.topics[0].cover='/api/image?source=zhihu&url='+encodeURIComponent(generated);
  assert.equal(media.shareEnImage(report,copy,1),undefined);
  report.topics[0].cover='https://i0.hdslb.com/news.jpg';
  copy.highlights[0].imageUrl=generated;
  assert.equal(media.shareEnImage(report,copy,1),undefined);
  assert.equal(validateImageAsset(imageAsset({sourceUrl:generated})),undefined);
  copy.sourceFingerprint=sourceFingerprint(report);
  assert.throws(()=>validateShareEn(copy,report),/image|url/i);
  // An old persisted override cannot invalidate the historical English story.
  report.shareEn=structuredClone(copy);
  const legacy=validateShareEn(copy,report);
  assert.equal(legacy.highlights[0].hook,copy.highlights[0].hook);
  assert.equal(media.shareEnImage(report,legacy,1),undefined);
  delete report.shareEn;
  delete copy.highlights[0].imageUrl;
 }
 assert.equal(new URL(media.shareEnImage(report,copy,1)!.src,'https://example.test').searchParams.get('mode'),'shareen');
});
