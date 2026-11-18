import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSource} from '../src/lib/ingest';
import {getSourceById} from '../src/lib/sources';
import {withEvidenceCapture} from '../src/lib/evidence-capture';
import type {EvidenceBatch} from '../src/lib/evidence-types';

test('live acquisition records original fields and zero metrics without a second request',async t=>{
 const previous=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({data:{list:[{title:'采集原始字段',bvid:'BVfixture',stat:{view:123,reply:0,like:0},extra_field:'未被归一化的字段'}]}}),{headers:{'content-type':'application/json'}});};
 t.after(()=>{globalThis.fetch=previous;});
 const batches:EvidenceBatch[]=[];
 const items=await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(getSourceById('bilibili')!));
 assert.equal(requests,1);assert.equal(items.length,1);assert.equal(batches.length,1);
 assert.equal(batches[0].status,'success');assert.equal(batches[0].source.provider,'direct');
 assert.ok(JSON.stringify(batches[0].response).includes('extra_field'));
 assert.equal(batches[0].items[0].metrics?.likes,0);assert.equal(batches[0].items[0].metrics?.comments,0);
});

test('malformed direct JSON and successful fallback are separate provenance records',async t=>{
 const previous=globalThis.fetch;
 const source={...getSourceById('weibo')!,thirdPartyUrl:'https://fallback.example/weibo?key=fixture-secret'};
 globalThis.fetch=async input=>String(input).startsWith('https://fallback.example')?
  new Response(JSON.stringify({data:[{title:'备用榜单',url:'https://example.test/fallback',hot:88}]})):
  new Response('{bad-json',{headers:{'content-type':'application/json'}});
 t.after(()=>{globalThis.fetch=previous;});
 const batches:EvidenceBatch[]=[];
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(source));
 assert.equal(batches.length,2);assert.equal(batches[0].status,'failed');assert.equal(batches[1].source.provider,'dailyhotapi');
 assert.equal(batches[1].status,'success');assert.equal(JSON.stringify(batches).includes('fixture-secret'),false);
});

test('an evidence persistence failure propagates instead of being swallowed as an empty source',async t=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{realtime:[{word:'必须保留的证据'}]}}));
 t.after(()=>{globalThis.fetch=previous;});
 await assert.rejects(()=>withEvidenceCapture(()=>{throw new Error('disk unavailable');},()=>fetchSource(getSourceById('weibo')!)),/disk unavailable/);
});

test('topic discussion counts keep their meaning and large platform identifiers remain exact in raw evidence',async t=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response('{"data":{"bang_topic":{"topic_list":[{"topic_name":"讨论量样本","topic_url":"https://tieba.baidu.com/topic/1","discuss_num":123,"topic_id":90071992547409931234}]}}}');
 t.after(()=>{globalThis.fetch=previous;});
 const batches:EvidenceBatch[]=[];
 await withEvidenceCapture(batch=>{batches.push(batch);},()=>fetchSource(getSourceById('tieba')!));
 assert.deepEqual(batches[0].items[0].metrics?.discussions,{value:123,scope:'topic',unit:'platform_count',path:'discuss_num'});
 assert.equal(batches[0].items[0].metrics?.replies,undefined);
 assert.ok(JSON.stringify(batches[0].response).includes('"90071992547409931234"'));
});
