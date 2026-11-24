import test from 'node:test';
import assert from 'node:assert/strict';
import {firstFeedItemEnvelope} from '../src/lib/comments/first-feed-item';

test('first feed item extraction stops at a complete object despite escaped braces and nested data',()=>{
 const first={content:'{"share_url":"https://m.toutiao.com/w/123/","text":"} ] \\" hello"}',nested:[{a:'b'}]};
 const encoded=JSON.stringify(first),prefix='{"data":['+encoded;
 for(let i=0;i<prefix.length;i++)assert.equal(firstFeedItemEnvelope(prefix.slice(0,i)),undefined);
 assert.deepEqual(JSON.parse(firstFeedItemEnvelope(prefix)!),{data:[first]});
 assert.deepEqual(JSON.parse(firstFeedItemEnvelope(prefix+',{unread trailing source data')!),{data:[first]});
});
test('empty, missing or corrupt source objects cannot become a fabricated first item',()=>{
 assert.deepEqual(JSON.parse(firstFeedItemEnvelope('{"data":[]')!),{data:[]});
 for(const value of ['{"error":"login"}','{"data":[{"bad":}', '{"data":[null', '{"data":["not an object"'])assert.equal(firstFeedItemEnvelope(value),undefined);
});
