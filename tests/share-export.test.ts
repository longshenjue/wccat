import test from 'node:test';
import assert from 'node:assert/strict';
import { fitShareEnCard, shareEnTextFiles } from '../src/lib/share-export';
import type { WccatDailyReport } from '../src/lib/daily-report';
import type { ShareEnCopy } from '../src/lib/shareen-types';

const copy = {selectedPostId:'choice-2',posts:[{id:'choice-1',text:'Other'}, {id:'choice-2',text:'WcCAT Daily Hot\n1. Real leader\n2. Real second\n3. Real third'}],altTexts:['Overview description','Highlight description']} as ShareEnCopy;
const report = {reportDate:'2026-11-15',windowStart:'2026-11-14 02:00',windowEnd:'2026-11-15 02:00',topics:[{rank:1,title:'Leader',links:[{sourceName:'News',url:'https://example.org/news'}]}]} as WccatDailyReport;

test('export text includes selected edited caption, ordered alt text and original sources/window', () => {
 const files = shareEnTextFiles(report, copy);
 assert.deepEqual(files.map(file=>file.name), ['post.txt','alt-text.txt','sources.txt']);
 assert.equal(new TextDecoder().decode(files[0].data), copy.posts[1].text+'\n');
 assert.match(new TextDecoder().decode(files[1].data), /01.*Overview description[\s\S]*02.*Highlight description/);
 const sources = new TextDecoder().decode(files[2].data);
 assert.match(sources, /https:\/\/example.org\/news/);
 assert.match(sources, /2026-11-14 02:00/);
 assert.match(sources, /UTC\+8/);
});

function measuredCard(normalHeight:number, compactHeight:number) {
 let compact=false;
 const zone={clientHeight:100,clientWidth:100,scrollWidth:100,get scrollHeight(){return compact?compactHeight:normalHeight;}};
 return {classList:{remove(){compact=false;},add(){compact=true;}},querySelectorAll(){return [zone];}} as unknown as HTMLElement;
}

test('card fitting switches to compact layout only when needed', () => {
 assert.equal(fitShareEnCard(measuredCard(90,80), '01 overview'), false);
 assert.equal(fitShareEnCard(measuredCard(110,90), '02 rank 8'), true);
});

test('oversized cards fail with exact card identity instead of exporting clipped content', () => {
 assert.throws(()=>fitShareEnCard(measuredCard(200,150), '03 · original rank #7'), /03 · original rank #7.*1200 × 1500/);
});

test('poster images decode before export; failed and timed-out covers become explicit text editions',async()=>{
 const {waitForPosterImages}=await import('../src/lib/share-export');
 let failures=0;
 const ready={complete:true,naturalWidth:100,decode:async()=>{},dispatchEvent:()=>{failures++;}};
 const broken={complete:true,naturalWidth:0,decode:async()=>{},dispatchEvent:()=>{failures++;}};
 const slow={complete:false,naturalWidth:0,decode:()=>new Promise(()=>{}),dispatchEvent:()=>{failures++;}};
 const root={querySelectorAll:()=>[ready,broken,slow]} as unknown as HTMLElement;
 assert.equal(await waitForPosterImages(root,10),2);
 assert.equal(failures,2);
});
