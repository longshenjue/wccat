import test from 'node:test';
import assert from 'node:assert/strict';
import {report as fixture} from './helpers/data-fixtures';
import {savedShareEnFixture} from './helpers/shareen-fixture';
import {validateShareEnStructure} from '../src/lib/shareen-validation';
import {validateShareEn} from '../src/lib/shareen';

test('draft validation blocks invalid export copy while leaving source verification to the server',async()=>{
 const report=fixture('2026-11-15');
 report.topics=[...report.topics,{...report.topics[0],id:'topic-two',rank:2}];
 const copy=await savedShareEnFixture(report);
 assert.deepEqual(validateShareEnStructure(copy,report),copy);
 for(const brand of ['WcCAT Daily Hot:','WcCAT Daily Hot 🇨🇳']){
  const punctuated={...copy,posts:copy.posts.map(p=>({...p,text:p.text.replace('WcCAT Daily Hot',brand)}))};
  assert.deepEqual(validateShareEnStructure(punctuated,report),punctuated);
 }
 assert.throws(()=>validateShareEnStructure({...copy,highlights:[{...copy.highlights[0],whatHappened:''},copy.highlights[1]]},report),/whatHappened/i);
 assert.throws(()=>validateShareEnStructure({...copy,posts:copy.posts.map(p=>({...p,text:'An unbranded unsaved draft'}))},report),/branding/i);
 assert.throws(()=>validateShareEnStructure({...copy,posts:copy.posts.map(p=>({...p,text:'WcCAT Daily Hot\nA draft missing its ranked summaries\nWcCAT: read the cards.'}))},report),/Top3/i);
 assert.throws(()=>validateShareEnStructure({...copy,overview:{...copy.overview,topics:[...copy.overview.topics].reverse()}},report),/identity|order/i);
 const changed={...report,overview:'最新中文日报内容'};
 assert.deepEqual(validateShareEnStructure(copy,changed),copy);
 assert.throws(()=>validateShareEn(copy,changed),/fingerprint/i);
 const warnings:string[]=[];
 assert.ok(validateShareEnStructure({...copy,overview:{...copy.overview,summary:'There are now 500 people.'}},report,{onWarning:m=>warnings.push(m)}));
 assert.ok(warnings.length);
});
