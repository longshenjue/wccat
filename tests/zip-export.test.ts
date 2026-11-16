import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, createStoreZip } from '../src/lib/client-zip';

function entries(bytes: Uint8Array) {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
 const result: Array<{name: string; data: Uint8Array}> = [];
 let offset = 0;
 while (view.getUint32(offset, true) === 0x04034b50) {
  assert.equal(view.getUint16(offset + 8, true), 0, 'ZIP entries use STORE compression');
  assert.equal(view.getUint16(offset + 6, true) & 0x800, 0x800, 'filenames are UTF-8');
  const size = view.getUint32(offset + 18, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const data = bytes.slice(start, start + size);
  assert.equal(view.getUint32(offset + 14, true), crc32(data));
  result.push({name: new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)), data});
  offset = start + size;
 }
 const directoryOffset = offset;
 for (const entry of result) {
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  const length = view.getUint16(offset + 28, true);
  assert.equal(new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + length)), entry.name);
  offset += 46 + length;
 }
 assert.equal(view.getUint32(offset, true), 0x06054b50);
 assert.equal(view.getUint16(offset + 10, true), result.length);
 assert.equal(view.getUint32(offset + 16, true), directoryOffset);
 assert.equal(offset + 22, bytes.length);
 return result;
}

test('CRC32 matches the ZIP standard check vector', () => {
 assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('ZIP preserves ordered PNG bytes and UTF-8 caption and alt-text files', () => {
 const files = [
  {name: '01-overview.png', data: new Uint8Array([137,80,78,71,0,255])},
  {name: '02-deep-dive.png', data: new Uint8Array([0,1,2])},
  {name: 'post.txt', data: new TextEncoder().encode('WcCAT Daily Hot\n1. Original Top 1\n2. Original Top 2\n3. Original Top 3')},
  {name: 'alt-text-中文.txt', data: new TextEncoder().encode('01 · English card description 🇨🇳')}
 ];
 assert.deepEqual(entries(createStoreZip(files)), files);
});

test('ZIP rejects duplicate or unsafe filenames instead of creating an ambiguous download', () => {
 for (const name of ['../post.txt', '/post.txt', 'a\\b.txt', '']) {
  assert.throws(() => createStoreZip([{name, data: new Uint8Array()}]), /filename/i);
 }
 assert.throws(() => createStoreZip([{name:'post.txt',data:new Uint8Array()}, {name:'post.txt',data:new Uint8Array()}]), /duplicate/i);
});
