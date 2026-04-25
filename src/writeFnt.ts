// Serializer for AngelCode BMFont binary format (.fnt)
// Spec: https://www.angelcode.com/products/bmfont/doc/file_format.html

export type { FntPadding, FntSpacing, FntInfo, FntCommon, FntChar, FntKerning, FntFont } from "./shared.js";
import type { FntFont, FntInfo, FntCommon, FntChar, FntKerning } from "./shared.js";

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function writeBlock(type: number, data: Uint8Array): Uint8Array {
  const meta = new Uint8Array(5);
  meta[0] = type;
  new DataView(meta.buffer).setUint32(1, data.length, true);
  return concat([meta, data]);
}

function writeInfoBlock(info: FntInfo): Uint8Array {
  const nameBytes = enc.encode(info.face);
  const data = new Uint8Array(14 + nameBytes.length + 1);
  const v = new DataView(data.buffer);
  v.setInt16(0, info.fontSize, true);
  let bitField = 0;
  if (info.smooth)       bitField |= 0x01;
  if (info.unicode)      bitField |= 0x02;
  if (info.italic)       bitField |= 0x04;
  if (info.bold)         bitField |= 0x08;
  if (info.fixedHeight)  bitField |= 0x10;
  data[2]  = bitField;
  data[3]  = info.charSet;
  v.setUint16(4, info.stretchH, true);
  data[6]  = info.aa;
  data[7]  = info.padding.up;
  data[8]  = info.padding.right;
  data[9]  = info.padding.down;
  data[10] = info.padding.left;
  data[11] = info.spacing.horizontal;
  data[12] = info.spacing.vertical;
  data[13] = info.outline;
  data.set(nameBytes, 14);
  return data;
}

function writeCommonBlock(common: FntCommon): Uint8Array {
  const data = new Uint8Array(15);
  const v = new DataView(data.buffer);
  v.setUint16(0, common.lineHeight, true);
  v.setUint16(2, common.base, true);
  v.setUint16(4, common.scaleW, true);
  v.setUint16(6, common.scaleH, true);
  v.setUint16(8, common.pages, true);
  data[10] = common.packed ? 0x80 : 0x00;
  data[11] = common.alphaChnl;
  data[12] = common.redChnl;
  data[13] = common.greenChnl;
  data[14] = common.blueChnl;
  return data;
}

function writePagesBlock(pages: string[]): Uint8Array {
  if (pages.length === 0) return new Uint8Array(0);
  const encoded = pages.map(p => enc.encode(p));
  // Spec: all page name strings have the same length (stride = maxLen + 1 null)
  const stride = Math.max(...encoded.map(e => e.length)) + 1;
  const data = new Uint8Array(pages.length * stride);
  encoded.forEach((e, i) => data.set(e, i * stride));
  return data;
}

function writeCharsBlock(chars: FntChar[]): Uint8Array {
  const data = new Uint8Array(chars.length * 20);
  const v = new DataView(data.buffer);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], b = i * 20;
    v.setUint32(b,      c.id,       true);
    v.setUint16(b + 4,  c.x,        true);
    v.setUint16(b + 6,  c.y,        true);
    v.setUint16(b + 8,  c.width,    true);
    v.setUint16(b + 10, c.height,   true);
    v.setInt16 (b + 12, c.xoffset,  true);
    v.setInt16 (b + 14, c.yoffset,  true);
    v.setInt16 (b + 16, c.xadvance, true);
    data[b + 18] = c.page;
    data[b + 19] = c.chnl;
  }
  return data;
}

function writeKerningsBlock(kernings: FntKerning[]): Uint8Array {
  const data = new Uint8Array(kernings.length * 10);
  const v = new DataView(data.buffer);
  for (let i = 0; i < kernings.length; i++) {
    const k = kernings[i], b = i * 10;
    v.setUint32(b,     k.first,  true);
    v.setUint32(b + 4, k.second, true);
    v.setInt16 (b + 8, k.amount, true);
  }
  return data;
}

export function writeFnt(font: FntFont): Uint8Array {
  const blocks: Uint8Array[] = [
    new Uint8Array([0x42, 0x4d, 0x46, 0x03]),
    writeBlock(1, writeInfoBlock(font.info)),
    writeBlock(2, writeCommonBlock(font.common)),
    writeBlock(3, writePagesBlock(font.pages)),
    writeBlock(4, writeCharsBlock(font.chars)),
  ];
  if (font.kernings.length > 0)
    blocks.push(writeBlock(5, writeKerningsBlock(font.kernings)));
  return concat(blocks);
}
