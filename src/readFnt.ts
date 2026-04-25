/*
 * Copyright (c) 2016-2025 Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Tools.
 *
 *   The Moddable SDK Tools is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Tools is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with the Moddable SDK Tools.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Parser for AngelCode BMFont binary format (.fnt)
// Spec: https://www.angelcode.com/products/bmfont/doc/file_format.html

export type { FntPadding, FntSpacing, FntInfo, FntCommon, FntChar, FntKerning, FntFont } from "./shared";
import type { FntInfo, FntCommon, FntChar, FntKerning, FntFont } from "./shared";

const utf8 = new TextDecoder("utf-8");

function dv(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function readNullTerminatedString(data: Uint8Array, offset: number): { value: string; end: number } {
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  return { value: utf8.decode(data.subarray(offset, end)), end: end + 1 };
}

function codePointToChar(id: number): string {
  try {
    return String.fromCodePoint(id);
  } catch {
    return "";
  }
}

function parseInfoBlock(data: Uint8Array): FntInfo {
  const v = dv(data);
  const bitField = data[2];
  const { value: face } = readNullTerminatedString(data, 14);
  return {
    fontSize: v.getInt16(0, true),
    smooth: !!(bitField & 0x01),
    unicode: !!(bitField & 0x02),
    italic: !!(bitField & 0x04),
    bold: !!(bitField & 0x08),
    fixedHeight: !!(bitField & 0x10),
    charSet: data[3],
    stretchH: v.getUint16(4, true),
    aa: data[6],
    padding: {
      up: data[7],
      right: data[8],
      down: data[9],
      left: data[10],
    },
    spacing: {
      horizontal: data[11],
      vertical: data[12],
    },
    outline: data[13],
    face,
  };
}

function parseCommonBlock(data: Uint8Array): FntCommon {
  const v = dv(data);
  return {
    lineHeight: v.getUint16(0, true),
    base: v.getUint16(2, true),
    scaleW: v.getUint16(4, true),
    scaleH: v.getUint16(6, true),
    pages: v.getUint16(8, true),
    packed: !!(data[10] & 0x80),
    alphaChnl: data[11],
    redChnl: data[12],
    greenChnl: data[13],
    blueChnl: data[14],
  };
}

function parsePagesBlock(data: Uint8Array): string[] {
  const pages: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    const { value, end } = readNullTerminatedString(data, offset);
    if (value.length > 0) pages.push(value);
    if (end <= offset) break;
    offset = end;
  }
  return pages;
}

function parseCharsBlock(data: Uint8Array): FntChar[] {
  const count = Math.floor(data.length / 20);
  const v = dv(data);
  const chars: FntChar[] = [];
  for (let i = 0; i < count; i++) {
    const b = i * 20;
    const id = v.getUint32(b, true);
    chars.push({
      id,
      char: codePointToChar(id),
      x: v.getUint16(b + 4, true),
      y: v.getUint16(b + 6, true),
      width: v.getUint16(b + 8, true),
      height: v.getUint16(b + 10, true),
      xoffset: v.getInt16(b + 12, true),
      yoffset: v.getInt16(b + 14, true),
      xadvance: v.getInt16(b + 16, true),
      page: data[b + 18],
      chnl: data[b + 19],
    });
  }
  return chars;
}

function parseKerningsBlock(data: Uint8Array): FntKerning[] {
  const count = Math.floor(data.length / 10);
  const v = dv(data);
  const kernings: FntKerning[] = [];
  for (let i = 0; i < count; i++) {
    const b = i * 10;
    const first = v.getUint32(b, true);
    const second = v.getUint32(b + 4, true);
    kernings.push({
      first,
      firstChar: codePointToChar(first),
      second,
      secondChar: codePointToChar(second),
      amount: v.getInt16(b + 8, true),
    });
  }
  return kernings;
}

export function readFnt(input: Uint8Array | ArrayBuffer): FntFont {
  const data = input instanceof ArrayBuffer ? new Uint8Array(input) : input;

  if (data.length < 4 || data[0] !== 0x42 || data[1] !== 0x4d || data[2] !== 0x46)
    throw new Error("Not a valid BMF font file");

  const version = data[3];
  if (version !== 3)
    throw new Error(`Unsupported BMF version ${version}, expected 3`);

  const view = dv(data);
  let info: FntInfo | undefined;
  let common: FntCommon | undefined;
  let pages: string[] = [];
  let chars: FntChar[] = [];
  let kernings: FntKerning[] = [];

  let offset = 4;
  while (offset < data.length) {
    const blockType = data[offset];
    const blockSize = view.getUint32(offset + 1, true);
    const blockData = data.subarray(offset + 5, offset + 5 + blockSize);
    offset += 5 + blockSize;

    switch (blockType) {
      case 1: info = parseInfoBlock(blockData); break;
      case 2: common = parseCommonBlock(blockData); break;
      case 3: pages = parsePagesBlock(blockData); break;
      case 4: chars = parseCharsBlock(blockData); break;
      case 5: kernings = parseKerningsBlock(blockData); break;
    }
  }

  if (!info) throw new Error("Missing info block (type 1)");
  if (!common) throw new Error("Missing common block (type 2)");

  return { info, common, pages, chars, kernings };
}
