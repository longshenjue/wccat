import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {ShareEnPoster,ShareEnPreviewCard} from '../src/components/shareen-poster';
import type {ShareEnCopy} from '../src/lib/shareen-types';
import type {ShareEnImageAsset} from '../src/lib/shareen-image-types';

async function setup(){
 const report=fixture('2026-11-15');report.topics=[...report.topics,{...report.topics[0],id:'second',rank:2}];
 report.topics[0].cover='https://i0.hdslb.com/bfs/archive/source.jpg';
 const copy:ShareEnCopy=await savedShareEnFixture(report);
 const asset:ShareEnImageAsset={version:1,id:'a'.repeat(64),requestKey:'b'.repeat(64),sourceHash:'c'.repeat(64),sourceUrl:report.topics[0].cover,model:'fixture',policyVersion:'shareen-image-v1',layout:'split',width:400,height:480,sourceWidth:1200,sourceHeight:800,protectedRegions:[],confidence:.4,reason:'Safe fallback',processedAt:'2026-11-16T00:00:00.000Z',mime:'image/webp'};
 copy.highlights[0].imageAsset=asset;
 return {report,copy};
}

test('cached split cards allocate only content width and leave debate outside the story grid',async()=>{
 const {report,copy}=await setup();
 const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1}));
 assert.match(markup,/class="shareen-story shareen-story-split"/);
 assert.match(markup,/grid-template-columns:400px minmax\(0,1fr\)/);
 assert.match(markup,/width:400px;height:272px/);
 assert.match(markup,/translate\(0px, -104px\)/);
 assert.ok(markup.indexOf('WHAT HAPPENED')<markup.indexOf('THE DEBATE'));
 assert.match(markup,/<\/section><\/div><section class="shareen-debate"/);
});

test('hidden or missing images leave the story full width and old covers keep exact wide canvas',async()=>{
 const {report,copy}=await setup();delete copy.highlights[0].imageAsset;
 const original=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1}));
 assert.match(original,/width:1072px;height:360px/);
 assert.doesNotMatch(original,/shareen-story-split/);
 for(const hide of [true,false]){
  copy.highlights[0].hideImage=hide; if(!hide)delete report.topics[0].cover;
  const markup=renderToStaticMarkup(createElement(ShareEnPoster,{report,copy,index:1}));
  assert.doesNotMatch(markup,/<figure|shareen-story-split|grid-template-columns/);
  assert.ok(markup.includes('WHAT HAPPENED')&&markup.includes('THE DEBATE'));
 }
});

test('focus preview exposes disabled reprocessing and the safe fallback reason',async()=>{
 const {report,copy}=await setup();
 const markup=renderToStaticMarkup(createElement(ShareEnPreviewCard,{report,copy,index:1,disabled:false,onDownload(){},onReprocess(){},processingDisabled:true}));
 assert.match(markup,/<button[^>]*disabled=""[^>]*>重新处理配图<\/button>/);
 assert.match(markup,/分栏/);assert.match(markup,/Safe fallback/);
});
