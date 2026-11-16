/** Small browser-only STORE ZIP encoder. PNGs are already compressed. */
export type ZipEntry = {name: string; data: Uint8Array};

const crcTable = Uint32Array.from({length: 256}, (_, index) => {
 let value = index;
 for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
 return value >>> 0;
});

export function crc32(data: Uint8Array): number {
 let crc = 0xffffffff;
 for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
 return (crc ^ 0xffffffff) >>> 0;
}

export function createStoreZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
 if (entries.length > 65535) throw new Error('Too many ZIP entries.');
 const names = new Set<string>();
 const encoded = entries.map(entry => {
  if (!entry.name || /[/\\\x00-\x1f]/.test(entry.name) || entry.name === '.' || entry.name === '..') throw new Error('Invalid ZIP filename.');
  if (names.has(entry.name)) throw new Error('Duplicate ZIP filename.');
  names.add(entry.name);
  const name = new TextEncoder().encode(entry.name);
  if (name.length > 65535 || entry.data.length > 0xffffffff) throw new Error('ZIP entry is too large.');
  return {...entry, nameBytes: name, crc: crc32(entry.data)};
 });
 const localSize = encoded.reduce((size, file) => size + 30 + file.nameBytes.length + file.data.length, 0);
 const directorySize = encoded.reduce((size, file) => size + 46 + file.nameBytes.length, 0);
 if (localSize + directorySize + 22 > 0xffffffff) throw new Error('ZIP archive is too large.');
 const output = new Uint8Array(localSize + directorySize + 22);
 const view = new DataView(output.buffer);
 let offset = 0;
 const offsets: number[] = [];
 for (const file of encoded) {
  offsets.push(offset);
  view.setUint32(offset, 0x04034b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 0x800, true);
  view.setUint16(offset + 12, 0x21, true); // 1980-01-01: valid deterministic DOS date.
  view.setUint32(offset + 14, file.crc, true);
  view.setUint32(offset + 18, file.data.length, true);
  view.setUint32(offset + 22, file.data.length, true);
  view.setUint16(offset + 26, file.nameBytes.length, true);
  output.set(file.nameBytes, offset + 30);
  output.set(file.data, offset + 30 + file.nameBytes.length);
  offset += 30 + file.nameBytes.length + file.data.length;
 }
 encoded.forEach((file, index) => {
  view.setUint32(offset, 0x02014b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 20, true);
  view.setUint16(offset + 8, 0x800, true);
  view.setUint16(offset + 14, 0x21, true);
  view.setUint32(offset + 16, file.crc, true);
  view.setUint32(offset + 20, file.data.length, true);
  view.setUint32(offset + 24, file.data.length, true);
  view.setUint16(offset + 28, file.nameBytes.length, true);
  view.setUint32(offset + 42, offsets[index], true);
  output.set(file.nameBytes, offset + 46);
  offset += 46 + file.nameBytes.length;
 });
 view.setUint32(offset, 0x06054b50, true);
 view.setUint16(offset + 8, entries.length, true);
 view.setUint16(offset + 10, entries.length, true);
 view.setUint32(offset + 12, directorySize, true);
 view.setUint32(offset + 16, localSize, true);
 return output;
}
