import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCommentExamples,visibleCommentQuotes,excerptComment} from '../src/lib/comments/selection';
import type {CommentSample} from '../src/lib/comments/types';
const battle={redLabel:'要求追责',blueLabel:'等待核实'};
const sample:CommentSample={runIds:['run-1'],comments:[10,100,50].map((likes,i)=>({id:'zhihu:'+i,text:'这是一条真实用户的原始发言 '+i,sourceId:'zhihu',sourceName:'知乎',articleUrl:'https://www.zhihu.com/question/123',url:'https://www.zhihu.com/question/123#comment-'+i,likes,rank:i+1,observedAt:'2026-11-24T01:00:00Z'}))};
test('server picks highest observed likes per stance and owns text, URL, likes and sample provenance',()=>{
 const value=selectCommentExamples(sample,battle,{classifications:[{id:'zhihu:0',side:'red',confidence:.95,englishText:'A real translated comment.'},{id:'zhihu:1',side:'red',confidence:.9,text:'FORGED',likes:999,url:'javascript:x',englishText:'Another real translated comment.'},{id:'zhihu:2',side:'blue',confidence:.99,englishText:'Wait for more evidence.'}]});
 assert.equal(value?.red?.id,'zhihu:1');assert.equal(value?.blue?.id,'zhihu:2');assert.equal(value?.red?.text,sample.comments[1].text);assert.equal(value?.red?.likes,100);assert.equal(value?.red?.url,sample.comments[1].url);assert.equal(value?.sampleCount,3);assert.deepEqual(value?.runIds,['run-1']);
});
test('unknown IDs, duplicate/conflicting IDs, uncertain or neutral items never become quotations',()=>{
 const result=selectCommentExamples(sample,battle,{classifications:[{id:'invented',side:'red',confidence:1,text:'Fake'},{id:'zhihu:0',side:'red',confidence:.79},{id:'zhihu:1',side:'red',confidence:.99},{id:'zhihu:1',side:'blue',confidence:.99},{id:'zhihu:2',side:'neutral',confidence:1}]});assert.equal(result,undefined);
});
test('single-sided sample remains single-sided; translations are optional and cannot replace originals',()=>{
 const value=selectCommentExamples(sample,battle,{classifications:[{id:'zhihu:0',side:'red',confidence:.9,englishText:'仍然是中文'}]})!;
 assert.ok(value.red);assert.equal(value.blue,undefined);assert.equal(value.red.englishText,undefined);
 assert.equal(visibleCommentQuotes(value,battle,'zh').length,1);assert.equal(visibleCommentQuotes(value,battle,'en').length,0);
 assert.equal(visibleCommentQuotes(value,{redLabel:'不同立场',blueLabel:battle.blueLabel},'zh').length,0);
});
test('a translation of a long comment is explicitly marked as a source excerpt, while the original is retained in full',()=>{
 const long={...sample,comments:[{...sample.comments[0],text:'请公布完整的情况说明和调查证据。'.repeat(12)}]};
 const result=selectCommentExamples(long,battle,{classifications:[{id:'zhihu:0',side:'red',confidence:.95,englishText:'Please publish a complete account and the evidence.'}]})!;
 assert.equal(result.red?.text,long.comments[0].text);assert.equal(result.red?.englishIsExcerpt,true);
});
test('malformed data, hostile links and HTML stay out of presentation; excerpts are explicitly bounded',()=>{
 assert.equal(selectCommentExamples(sample,battle,{classifications:'bad'}),undefined);
 const result=selectCommentExamples(sample,battle,{classifications:[{id:'zhihu:0',side:'red',confidence:.9}]})!;
 result.red!.url='javascript:alert(1)';assert.equal(visibleCommentQuotes(result,battle,'zh').length,0);
 assert.equal(excerptComment('a'.repeat(200),'zh').text.length,97);assert.equal(excerptComment('a'.repeat(200),'zh').excerpt,true);
 assert.equal(excerptComment(Array(60).fill('word').join(' '),'en').text.split(' ').length,32);
});
