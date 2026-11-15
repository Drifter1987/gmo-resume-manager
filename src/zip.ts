export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP writer: stored (uncompressed) entries, which Word accepts. */
export function createZip(files: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const dosTime = 0;
  const dosDate = 33; // 1980-01-01

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // bit 11: file names are UTF-8
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    parts.push(local, file.data);

    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += local.length + size;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}


async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Decompression = (globalThis as unknown as { DecompressionStream?: new (format: string) => TransformStream })
    .DecompressionStream;
  if (!Decompression) throw new Error('This browser cannot open compressed ZIP/DOCX files.');
  const stream = new Blob([data]).stream().pipeThrough(new Decompression('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a ZIP archive (stored or deflated entries) into a name -> bytes map. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();

  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('That file is not a valid ZIP archive.');

  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);

  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const compressed = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localAt = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    pos += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (localAt + 30 > bytes.length) continue;

    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const raw = bytes.subarray(dataAt, dataAt + compressed);

    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
  }

  return files;
}
