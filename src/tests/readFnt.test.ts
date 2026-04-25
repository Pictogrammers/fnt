import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { readFnt } from "../readFnt";
import type { FntFont } from "../shared";

function readFntFile(filePath: string): FntFont {
  return readFnt(fs.readFileSync(filePath));
}

const FONTS = path.resolve(__dirname, "fonts");
const font = (name: string) => path.join(FONTS, name);

// ---------------------------------------------------------------------------
// Helpers to build minimal synthetic BMF v3 buffers for edge-case tests
// ---------------------------------------------------------------------------

function buildInfoBlock(opts: {
  fontSize?: number;
  bitField?: number;
  charSet?: number;
  stretchH?: number;
  aa?: number;
  padding?: [number, number, number, number];
  spacing?: [number, number];
  outline?: number;
  face?: string;
}): Buffer {
  const face = opts.face ?? "Test";
  const nameBytes = Buffer.from(face + "\0", "utf8");
  const block = Buffer.alloc(14 + nameBytes.length);
  block.writeInt16LE(opts.fontSize ?? 16, 0);
  block[2] = opts.bitField ?? 0x03;
  block[3] = opts.charSet ?? 0;
  block.writeUInt16LE(opts.stretchH ?? 100, 4);
  block[6] = opts.aa ?? 1;
  const [pu, pr, pd, pl] = opts.padding ?? [0, 0, 0, 0];
  block[7] = pu; block[8] = pr; block[9] = pd; block[10] = pl;
  const [sh, sv] = opts.spacing ?? [2, 2];
  block[11] = sh; block[12] = sv;
  block[13] = opts.outline ?? 0;
  nameBytes.copy(block, 14);
  return block;
}

function buildCommonBlock(opts: {
  lineHeight?: number;
  base?: number;
  scaleW?: number;
  scaleH?: number;
  pages?: number;
  packed?: boolean;
  alphaChnl?: number;
  redChnl?: number;
  greenChnl?: number;
  blueChnl?: number;
}): Buffer {
  const b = Buffer.alloc(15);
  b.writeUInt16LE(opts.lineHeight ?? 20, 0);
  b.writeUInt16LE(opts.base ?? 16, 2);
  b.writeUInt16LE(opts.scaleW ?? 128, 4);
  b.writeUInt16LE(opts.scaleH ?? 128, 6);
  b.writeUInt16LE(opts.pages ?? 1, 8);
  b[10] = opts.packed ? 0x80 : 0x00;
  b[11] = opts.alphaChnl ?? 0;
  b[12] = opts.redChnl ?? 0;
  b[13] = opts.greenChnl ?? 0;
  b[14] = opts.blueChnl ?? 0;
  return b;
}

function buildPagesBlock(names: string[]): Buffer {
  return Buffer.from(names.map((n) => n + "\0").join(""), "utf8");
}

function buildCharsBlock(chars: Array<{
  id: number; x: number; y: number; width: number; height: number;
  xoffset: number; yoffset: number; xadvance: number; page: number; chnl: number;
}>): Buffer {
  const b = Buffer.alloc(chars.length * 20);
  chars.forEach((c, i) => {
    const o = i * 20;
    b.writeUInt32LE(c.id, o);
    b.writeUInt16LE(c.x, o + 4);
    b.writeUInt16LE(c.y, o + 6);
    b.writeUInt16LE(c.width, o + 8);
    b.writeUInt16LE(c.height, o + 10);
    b.writeInt16LE(c.xoffset, o + 12);
    b.writeInt16LE(c.yoffset, o + 14);
    b.writeInt16LE(c.xadvance, o + 16);
    b[o + 18] = c.page;
    b[o + 19] = c.chnl;
  });
  return b;
}

function buildKerningsBlock(pairs: Array<{ first: number; second: number; amount: number }>): Buffer {
  const b = Buffer.alloc(pairs.length * 10);
  pairs.forEach((k, i) => {
    const o = i * 10;
    b.writeUInt32LE(k.first, o);
    b.writeUInt32LE(k.second, o + 4);
    b.writeInt16LE(k.amount, o + 8);
  });
  return b;
}

function buildBmfBuffer(blocks: Array<{ type: number; data: Buffer }>): Buffer {
  const header = Buffer.from([0x42, 0x4d, 0x46, 0x03]); // BMF3
  const parts: Buffer[] = [header];
  for (const { type, data } of blocks) {
    const meta = Buffer.alloc(5);
    meta[0] = type;
    meta.writeUInt32LE(data.length, 1);
    parts.push(meta, data);
  }
  return Buffer.concat(parts);
}

function minimalFont(overrides?: {
  infoBitField?: number;
  infoFace?: string;
  commonPacked?: boolean;
  pages?: string[];
  chars?: Parameters<typeof buildCharsBlock>[0];
  kernings?: Parameters<typeof buildKerningsBlock>[0];
  includeKerningBlock?: boolean;
}): Buffer {
  const blocks: Array<{ type: number; data: Buffer }> = [
    { type: 1, data: buildInfoBlock({ bitField: overrides?.infoBitField, face: overrides?.infoFace }) },
    { type: 2, data: buildCommonBlock({ packed: overrides?.commonPacked }) },
    { type: 3, data: buildPagesBlock(overrides?.pages ?? ["font.png"]) },
    { type: 4, data: buildCharsBlock(overrides?.chars ?? []) },
  ];
  if (overrides?.includeKerningBlock !== false && overrides?.kernings) {
    blocks.push({ type: 5, data: buildKerningsBlock(overrides.kernings) });
  }
  return buildBmfBuffer(blocks);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readFnt – header validation", () => {
  it("throws on buffer shorter than 4 bytes", () => {
    expect(() => readFnt(Buffer.from([0x42, 0x4d, 0x46]))).toThrow("Not a valid BMF font file");
  });

  it("throws when magic bytes are wrong", () => {
    expect(() => readFnt(Buffer.from([0x41, 0x4d, 0x46, 0x03]))).toThrow("Not a valid BMF font file");
    expect(() => readFnt(Buffer.from([0x42, 0x4d, 0x47, 0x03]))).toThrow("Not a valid BMF font file");
  });

  it("throws on unsupported BMF version", () => {
    expect(() => readFnt(Buffer.from([0x42, 0x4d, 0x46, 0x02]))).toThrow("Unsupported BMF version 2");
    expect(() => readFnt(Buffer.from([0x42, 0x4d, 0x46, 0x01]))).toThrow("Unsupported BMF version 1");
  });

  it("throws when info block is absent", () => {
    const buf = buildBmfBuffer([
      { type: 2, data: buildCommonBlock({}) },
      { type: 3, data: buildPagesBlock(["font.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    expect(() => readFnt(buf)).toThrow("Missing info block");
  });

  it("throws when common block is absent", () => {
    const buf = buildBmfBuffer([
      { type: 1, data: buildInfoBlock({}) },
      { type: 3, data: buildPagesBlock(["font.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    expect(() => readFnt(buf)).toThrow("Missing common block");
  });
});

// ---------------------------------------------------------------------------
// Block type 1 – info
// ---------------------------------------------------------------------------

describe("readFnt – info block (block type 1)", () => {
  let font16: FntFont;
  let italic: FntFont;

  beforeAll(() => {
    font16 = readFntFile(font("OpenSans-Regular-16.fnt"));
    italic = readFntFile(font("OpenSans-SemiboldItalic-18.fnt"));
  });

  it("parses face name as null-terminated UTF-8 string", () => {
    expect(font16.info.face).toBe("Open Sans");
    expect(readFntFile(font("Roboto-Regular-18.fnt")).info.face).toBe("Roboto");
    expect(readFntFile(font("myFont.fnt")).info.face).toBe("Hiragino Kaku Gothic Std");
  });

  it("parses fontSize as signed 16-bit integer", () => {
    expect(typeof font16.info.fontSize).toBe("number");
    expect(font16.info.fontSize).toBe(-13163);
  });

  it("parses smooth flag (bitfield bit 0)", () => {
    expect(font16.info.smooth).toBe(true);
    // bit 0 = 0 → not smooth
    const f = readFnt(minimalFont({ infoBitField: 0x00 }));
    expect(f.info.smooth).toBe(false);
  });

  it("parses unicode flag (bitfield bit 1)", () => {
    expect(font16.info.unicode).toBe(true);
    const f = readFnt(minimalFont({ infoBitField: 0x00 }));
    expect(f.info.unicode).toBe(false);
  });

  it("parses italic flag (bitfield bit 2)", () => {
    expect(font16.info.italic).toBe(false);
    const f = readFnt(minimalFont({ infoBitField: 0x04 }));
    expect(f.info.italic).toBe(true);
  });

  it("parses bold flag (bitfield bit 3)", () => {
    expect(font16.info.bold).toBe(false);
    const f = readFnt(minimalFont({ infoBitField: 0x08 }));
    expect(f.info.bold).toBe(true);
  });

  it("parses fixedHeight flag (bitfield bit 4)", () => {
    expect(font16.info.fixedHeight).toBe(false);
    const f = readFnt(minimalFont({ infoBitField: 0x10 }));
    expect(f.info.fixedHeight).toBe(true);
  });

  it("parses all bitfield flags independently", () => {
    // 0x1F = smooth | unicode | italic | bold | fixedHeight
    const f = readFnt(minimalFont({ infoBitField: 0x1f }));
    expect(f.info).toMatchObject({ smooth: true, unicode: true, italic: true, bold: true, fixedHeight: true });
  });

  it("parses charSet", () => {
    expect(font16.info.charSet).toBe(0);
  });

  it("parses stretchH as unsigned 16-bit integer", () => {
    expect(font16.info.stretchH).toBe(100);
  });

  it("parses aa (supersampling level)", () => {
    expect(font16.info.aa).toBe(1);
  });

  it("parses padding as { up, right, down, left }", () => {
    expect(font16.info.padding).toEqual({ up: 0, right: 0, down: 0, left: 0 });
    // synthetic with non-zero padding
    const blockData = buildInfoBlock({ padding: [1, 2, 3, 4] });
    const buf = buildBmfBuffer([
      { type: 1, data: blockData },
      { type: 2, data: buildCommonBlock({}) },
      { type: 3, data: buildPagesBlock(["f.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    const f = readFnt(buf);
    expect(f.info.padding).toEqual({ up: 1, right: 2, down: 3, left: 4 });
  });

  it("parses spacing as { horizontal, vertical }", () => {
    expect(font16.info.spacing).toEqual({ horizontal: 2, vertical: 2 });
    const blockData = buildInfoBlock({ spacing: [3, 5] });
    const buf = buildBmfBuffer([
      { type: 1, data: blockData },
      { type: 2, data: buildCommonBlock({}) },
      { type: 3, data: buildPagesBlock(["f.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    expect(readFnt(buf).info.spacing).toEqual({ horizontal: 3, vertical: 5 });
  });

  it("parses outline thickness", () => {
    expect(font16.info.outline).toBe(0);
    const blockData = buildInfoBlock({ outline: 2 });
    const buf = buildBmfBuffer([
      { type: 1, data: blockData },
      { type: 2, data: buildCommonBlock({}) },
      { type: 3, data: buildPagesBlock(["f.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    expect(readFnt(buf).info.outline).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Block type 2 – common
// ---------------------------------------------------------------------------

describe("readFnt – common block (block type 2)", () => {
  let font16: FntFont;

  beforeAll(() => {
    font16 = readFntFile(font("OpenSans-Regular-16.fnt"));
  });

  it("parses lineHeight", () => {
    expect(font16.common.lineHeight).toBe(21);
  });

  it("parses base (pixels from top of line to character baseline)", () => {
    expect(font16.common.base).toBe(17);
  });

  it("parses scaleW and scaleH (texture dimensions)", () => {
    expect(font16.common.scaleW).toBe(106);
    expect(font16.common.scaleH).toBe(165);
  });

  it("parses pages count", () => {
    expect(font16.common.pages).toBe(1);
  });

  it("parses packed flag from bitfield bit 7", () => {
    expect(font16.common.packed).toBe(true);
    const f = readFnt(minimalFont({ commonPacked: false }));
    expect(f.common.packed).toBe(false);
  });

  it("parses alphaChnl", () => {
    expect(font16.common.alphaChnl).toBe(0);
  });

  it("parses redChnl, greenChnl, blueChnl", () => {
    expect(font16.common.redChnl).toBe(0);
    expect(font16.common.greenChnl).toBe(0);
    expect(font16.common.blueChnl).toBe(0);
  });

  it("parses non-zero channel values", () => {
    const data = buildCommonBlock({ alphaChnl: 4, redChnl: 1, greenChnl: 2, blueChnl: 3 });
    const buf = buildBmfBuffer([
      { type: 1, data: buildInfoBlock({}) },
      { type: 2, data },
      { type: 3, data: buildPagesBlock(["f.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    const f = readFnt(buf);
    expect(f.common).toMatchObject({ alphaChnl: 4, redChnl: 1, greenChnl: 2, blueChnl: 3 });
  });
});

// ---------------------------------------------------------------------------
// Block type 3 – pages
// ---------------------------------------------------------------------------

describe("readFnt – pages block (block type 3)", () => {
  it("parses a single page filename", () => {
    const font16 = readFntFile(font("OpenSans-Regular-16.fnt"));
    expect(font16.pages).toEqual(["OpenSans-Regular-16.png"]);
  });

  it("parses page filename for myFont", () => {
    const mf = readFntFile(font("myFont.fnt"));
    expect(mf.pages).toEqual(["myFont.png"]);
  });

  it("parses page filename for SemiboldItalic (name differs from file stem)", () => {
    const f = readFntFile(font("OpenSans-SemiboldItalic-18.fnt"));
    expect(f.pages).toEqual(["OpenSans-Semibold-Italic-18.png"]);
  });

  it("parses pages count matches common.pages", () => {
    const f = readFntFile(font("OpenSans-Regular-16.fnt"));
    expect(f.pages.length).toBe(f.common.pages);
  });

  it("parses multiple null-terminated page names from synthetic buffer", () => {
    const buf = buildBmfBuffer([
      { type: 1, data: buildInfoBlock({}) },
      { type: 2, data: buildCommonBlock({ pages: 2 }) },
      { type: 3, data: buildPagesBlock(["page0.png", "page1.png"]) },
      { type: 4, data: buildCharsBlock([]) },
    ]);
    expect(readFnt(buf).pages).toEqual(["page0.png", "page1.png"]);
  });
});

// ---------------------------------------------------------------------------
// Block type 4 – chars
// ---------------------------------------------------------------------------

describe("readFnt – chars block (block type 4)", () => {
  let font16: FntFont;

  beforeAll(() => {
    font16 = readFntFile(font("OpenSans-Regular-16.fnt"));
  });

  it("parses char count (blockSize / 20)", () => {
    expect(font16.chars.length).toBe(95);
    expect(readFntFile(font("myFont.fnt")).chars.length).toBe(115);
  });

  it("parses char id as unsigned 32-bit integer", () => {
    expect(font16.chars[0].id).toBe(32); // space
    expect(font16.chars[1].id).toBe(33); // '!'
  });

  it("maps id to unicode character string", () => {
    expect(font16.chars[0].char).toBe(" ");
    expect(font16.chars[1].char).toBe("!");
    expect(font16.chars[2].char).toBe('"');
  });

  it("parses x and y positions in texture (unsigned 16-bit)", () => {
    expect(font16.chars[0].x).toBe(95);
    expect(font16.chars[0].y).toBe(140);
    expect(font16.chars[1].x).toBe(90);
    expect(font16.chars[1].y).toBe(99);
  });

  it("parses width and height of character image (unsigned 16-bit)", () => {
    expect(font16.chars[0].width).toBe(0);  // space has no glyph
    expect(font16.chars[0].height).toBe(0);
    expect(font16.chars[1].width).toBe(3);
    expect(font16.chars[1].height).toBe(13);
  });

  it("parses xoffset and yoffset as signed 16-bit integers", () => {
    expect(font16.chars[1].xoffset).toBe(1);
    expect(font16.chars[1].yoffset).toBe(5);
  });

  it("parses xadvance as signed 16-bit integer", () => {
    expect(font16.chars[1].xadvance).toBe(4);
  });

  it("parses page field", () => {
    expect(font16.chars[0].page).toBe(1);
  });

  it("parses chnl field", () => {
    expect(font16.chars[0].chnl).toBe(0);
  });

  it("parses negative xoffset from synthetic buffer", () => {
    const buf = minimalFont({
      chars: [{ id: 65, x: 0, y: 0, width: 10, height: 10, xoffset: -2, yoffset: -1, xadvance: 8, page: 0, chnl: 15 }],
    });
    const f = readFnt(buf);
    expect(f.chars[0].xoffset).toBe(-2);
    expect(f.chars[0].yoffset).toBe(-1);
    expect(f.chars[0].chnl).toBe(15);
  });

  it("parses char id for full unicode code point (4-byte id)", () => {
    const emoji = 0x1f600; // 😀
    const buf = minimalFont({
      chars: [{ id: emoji, x: 0, y: 0, width: 20, height: 20, xoffset: 0, yoffset: 0, xadvance: 20, page: 0, chnl: 15 }],
    });
    const f = readFnt(buf);
    expect(f.chars[0].id).toBe(emoji);
    expect(f.chars[0].char).toBe("😀");
  });

  it("returns empty string for invalid unicode code points", () => {
    const invalidCodePoint = 0xffffff;
    const buf = minimalFont({
      chars: [{ id: invalidCodePoint, x: 0, y: 0, width: 0, height: 0, xoffset: 0, yoffset: 0, xadvance: 0, page: 0, chnl: 0 }],
    });
    const f = readFnt(buf);
    expect(f.chars[0].char).toBe("");
  });

  it("returns empty chars array when block is empty", () => {
    const buf = minimalFont({ chars: [] });
    expect(readFnt(buf).chars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Block type 5 – kerning pairs
// ---------------------------------------------------------------------------

describe("readFnt – kernings block (block type 5)", () => {
  let font16: FntFont;
  let italic: FntFont;
  let myFont: FntFont;

  beforeAll(() => {
    font16 = readFntFile(font("OpenSans-Regular-16.fnt"));
    italic = readFntFile(font("OpenSans-SemiboldItalic-18.fnt"));
    myFont = readFntFile(font("myFont.fnt"));
  });

  it("parses kerning pair count (blockSize / 10)", () => {
    expect(font16.kernings.length).toBe(23);
    expect(italic.kernings.length).toBe(51);
  });

  it("parses first and second char ids as unsigned 32-bit integers", () => {
    expect(font16.kernings[0].first).toBe(46);  // '.'
    expect(font16.kernings[0].second).toBe(84); // 'T'
  });

  it("maps first/second ids to unicode character strings", () => {
    expect(font16.kernings[0].firstChar).toBe(".");
    expect(font16.kernings[0].secondChar).toBe("T");
    expect(italic.kernings[0].firstChar).toBe('"');
    expect(italic.kernings[0].secondChar).toBe("o");
  });

  it("parses negative kerning amounts", () => {
    expect(font16.kernings[0].amount).toBe(-1);  // '.' -> 'T'
    // P -> ',' is -2 (more negative)
    const pComma = font16.kernings.find((k) => k.first === 80 && k.second === 44);
    expect(pComma?.amount).toBe(-2);
    // F -> '.' in Regular-72 is -4
    const font72 = readFntFile(font("OpenSans-Regular-72.fnt"));
    const fDot = font72.kernings.find((k) => k.first === 70 && k.second === 46);
    expect(fDot?.amount).toBe(-4);
  });

  it("parses positive kerning amounts", () => {
    // OpenSans-Regular-16: '(' -> 'J' = +1
    const openParen = font16.kernings.find((k) => k.first === 40 && k.second === 74);
    expect(openParen?.amount).toBe(1);
    // 'A' -> 'J' = +2
    const aJ = font16.kernings.find((k) => k.first === 65 && k.second === 74);
    expect(aJ?.amount).toBe(2);
  });

  it("returns empty kernings array when block is absent", () => {
    const buf = buildBmfBuffer([
      { type: 1, data: buildInfoBlock({}) },
      { type: 2, data: buildCommonBlock({}) },
      { type: 3, data: buildPagesBlock(["f.png"]) },
      { type: 4, data: buildCharsBlock([]) },
      // no block type 5
    ]);
    expect(readFnt(buf).kernings).toEqual([]);
  });

  it("returns empty kernings array when kerning block has zero entries", () => {
    // myFont has a block type 5 of size 0
    expect(myFont.kernings).toEqual([]);
  });

  it("parses kernings from synthetic buffer", () => {
    const buf = minimalFont({
      kernings: [
        { first: 84, second: 97, amount: -1 },  // T -> a
        { first: 89, second: 65, amount: -2 },  // Y -> A
      ],
    });
    const f = readFnt(buf);
    expect(f.kernings).toHaveLength(2);
    expect(f.kernings[0]).toMatchObject({ first: 84, firstChar: "T", second: 97, secondChar: "a", amount: -1 });
    expect(f.kernings[1]).toMatchObject({ first: 89, firstChar: "Y", second: 65, secondChar: "A", amount: -2 });
  });
});

// ---------------------------------------------------------------------------
// readFntFile
// ---------------------------------------------------------------------------

describe("readFntFile", () => {
  it("reads and parses a font from the filesystem", () => {
    const f = readFntFile(font("OpenSans-Regular-16.fnt"));
    expect(f.info.face).toBe("Open Sans");
    expect(f.chars.length).toBeGreaterThan(0);
  });

  it("throws when the file does not exist", () => {
    expect(() => readFntFile(font("nonexistent.fnt"))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// All real fonts smoke test
// ---------------------------------------------------------------------------

describe("readFntFile – all fonts in fonts/ directory", () => {
  const fntFiles = fs
    .readdirSync(FONTS)
    .filter((f) => f.endsWith(".fnt"))
    .sort();

  it.each(fntFiles)("%s parses without error and has required fields", (name) => {
    const f = readFntFile(font(name));
    expect(f.info.face).toBeTypeOf("string");
    expect(f.info.face.length).toBeGreaterThan(0);
    expect(f.common.lineHeight).toBeGreaterThan(0);
    expect(f.common.scaleW).toBeGreaterThan(0);
    expect(f.common.scaleH).toBeGreaterThan(0);
    expect(f.pages.length).toBe(f.common.pages);
    expect(f.chars.length).toBeGreaterThan(0);
    expect(Array.isArray(f.kernings)).toBe(true);
  });
});
