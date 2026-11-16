import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShareEnJson} from '../src/lib/shareen-json';

test('duplicate JSON fields are removed without touching valid siblings, arrays or escaped strings',()=>{
 assert.deepEqual(parseShareEnJson('{"topics":{"a":{"title":"First","title":"Last","hook":"Keep this"},"b":{"title":"Keep B"}},"notes":[{"x":1,"x":2,"text":"an escaped \\\"title\\\" and braces {}"}]}'),{topics:{a:{hook:'Keep this'},b:{title:'Keep B'}},notes:[{text:'an escaped "title" and braces {}'}]});
 assert.deepEqual(parseShareEnJson('{"topics":{"a":{"title":"One"},"a":{"title":"Two"},"b":{"title":"B"}}}'),{topics:{b:{title:'B'}}});
 assert.throws(()=>parseShareEnJson('{"incomplete":'),SyntaxError);
 assert.throws(()=>parseShareEnJson('['.repeat(130)+'0'+']'.repeat(130)),/deep/);
});
