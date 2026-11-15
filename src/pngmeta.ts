import { crc32 } from './zip';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((value, index) => bytes[index] === value);
}

/** Inserts a tEXt chunk (Latin-1 text only) straight after IHDR. */
export function embedPngText(png: Uint8Array, key: string, text: string): Uint8Array {
  if (!isPng(png)) return png;

  const data = new Uint8Array(key.length + 1 + text.length);
  for (let i = 0; i < key.length; i += 1) data[i] = key.charCodeAt(i) & 0xff;
  data[key.length] = 0;
  for (let i = 0; i < text.length; i += 1) data[key.length + 1 + i] = text.charCodeAt(i) & 0xff;

  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

  // signature (8) + IHDR chunk (4 length + 4 type + 13 data + 4 crc)
  const at = 8 + 25;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

/** Reads the first tEXt chunk with the given key. */
export function extractPngText(png: Uint8Array, key: string): string | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;

  while (pos + 12 <= png.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === 'tEXt') {
      const body = png.subarray(pos + 8, pos + 8 + length);
      const zero = body.indexOf(0);
      if (zero > 0) {
        let name = '';
        for (let i = 0; i < zero; i += 1) name += String.fromCharCode(body[i]);
        if (name === key) {
          let text = '';
          for (let i = zero + 1; i < body.length; i += 1) text += String.fromCharCode(body[i]);
          return text;
        }
      }
    }
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  return null;
}
