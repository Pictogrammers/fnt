import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";
import { readFnt } from "../readFnt";
import { writeFnt } from "../writeFnt";
import type { FntFont } from "./shared";

const FONTS = path.resolve(__dirname, "fonts");
const fontPath = (name: string) => path.join(FONTS, name);

function readFont(name: string): FntFont {
  return readFnt(fs.readFileSync(fontPath(name)));
}

function makeFont(overrides: Partial<FntFont> = {}): FntFont {
  const pages = overrides.pages ?? ["font.png"];
  return {
    info: {
      face: "Test", fontSize: 16, smooth: true, unicode: true,
      italic: false, bold: false, fixedHeight: false,
      charSet: 0, stretchH: 100, aa: 1,
      padding: { up: 0, right: 0, down: 0, left: 0 },
      spacing: { horizontal: 2, vertical: 2 },
      outline: 0,
      ...overrides.info,
    },
    common: {
      lineHeight: 20, base: 16, scaleW: 128, scaleH: 128,
      pages: pages.length,
      packed: false, alphaChnl: 0, redChnl: 0, greenChnl: 0, blueChnl: 0,
      ...overrides.common,
    },
    pages,
    chars: overrides.chars ?? [],
    kernings: overrides.kernings ?? [],
  };
}

// Scans raw output and returns the block type byte for each block
function blockTypes(data: Uint8Array): number[] {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const types: number[] = [];
  let off = 4;
  while (off < data.length) {
    types.push(data[off]);
    off += 5 + v.getUint32(off + 1, true);
  }
  return types;
}

// ---------------------------------------------------------------------------
// Output type and header
// ---------------------------------------------------------------------------

describe("writeFnt – output", () => {
  it("returns a Uint8Array", () => {
    expect(writeFnt(makeFont())).toBeInstanceOf(Uint8Array);
  });

  it("starts with BMF3 magic bytes", () => {
    const out = writeFnt(makeFont());
    expect(out[0]).toBe(0x42);
    expect(out[1]).toBe(0x4d);
    expect(out[2]).toBe(0x46);
    expect(out[3]).toBe(0x03);
  });

  it("is parseable by readFnt", () => {
    expect(() => readFnt(writeFnt(makeFont()))).not.toThrow();
  });

  it("always emits blocks 1-4 in order", () => {
    expect(blockTypes(writeFnt(makeFont()))).toEqual([1, 2, 3, 4]);
  });

  it("encodes correct block sizes in the binary output", () => {
    const out = writeFnt(makeFont({ info: { ...makeFont().info, face: "Test" } }));
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    // Block 1 starts at offset 4
    expect(out[4]).toBe(1);
    const infoSize = v.getUint32(5, true);
    expect(infoSize).toBe(14 + 4 + 1); // 14 fixed + "Test\0" = 19
    // Block 2 immediately follows
    const b2 = 4 + 5 + infoSize;
    expect(out[b2]).toBe(2);
    expect(v.getUint32(b2 + 1, true)).toBe(15); // common block is always 15 bytes
  });
});

// ---------------------------------------------------------------------------
// Block type 1 – info
// ---------------------------------------------------------------------------

describe("writeFnt – info block (block type 1)", () => {
  it("roundtrips face name", () => {
    expect(readFnt(writeFnt(makeFont({ info: { ...makeFont().info, face: "Open Sans" } }))).info.face).toBe("Open Sans");
    expect(readFnt(writeFnt(makeFont({ info: { ...makeFont().info, face: "Hiragino Kaku Gothic Std" } }))).info.face).toBe("Hiragino Kaku Gothic Std");
  });

  it("roundtrips negative fontSize", () => {
    const f = makeFont({ info: { ...makeFont().info, fontSize: -13163 } });
    expect(readFnt(writeFnt(f)).info.fontSize).toBe(-13163);
  });

  it("roundtrips smooth and unicode flags (bits 0-1)", () => {
    const off = makeFont({ info: { ...makeFont().info, smooth: false, unicode: false } });
    expect(readFnt(writeFnt(off)).info).toMatchObject({ smooth: false, unicode: false });
  });

  it("roundtrips italic flag (bit 2)", () => {
    const f = makeFont({ info: { ...makeFont().info, italic: true } });
    expect(readFnt(writeFnt(f)).info.italic).toBe(true);
  });

  it("roundtrips bold flag (bit 3)", () => {
    const f = makeFont({ info: { ...makeFont().info, bold: true } });
    expect(readFnt(writeFnt(f)).info.bold).toBe(true);
  });

  it("roundtrips fixedHeight flag (bit 4)", () => {
    const f = makeFont({ info: { ...makeFont().info, fixedHeight: true } });
    expect(readFnt(writeFnt(f)).info.fixedHeight).toBe(true);
  });

  it("roundtrips all bitfield flags set simultaneously", () => {
    const info = { ...makeFont().info, smooth: true, unicode: true, italic: true, bold: true, fixedHeight: true };
    expect(readFnt(writeFnt(makeFont({ info }))).info).toMatchObject(
      { smooth: true, unicode: true, italic: true, bold: true, fixedHeight: true }
    );
  });

  it("roundtrips charSet and stretchH", () => {
    const f = makeFont({ info: { ...makeFont().info, charSet: 255, stretchH: 150 } });
    const result = readFnt(writeFnt(f)).info;
    expect(result.charSet).toBe(255);
    expect(result.stretchH).toBe(150);
  });

  it("roundtrips aa", () => {
    const f = makeFont({ info: { ...makeFont().info, aa: 2 } });
    expect(readFnt(writeFnt(f)).info.aa).toBe(2);
  });

  it("roundtrips padding (up, right, down, left)", () => {
    const f = makeFont({ info: { ...makeFont().info, padding: { up: 1, right: 2, down: 3, left: 4 } } });
    expect(readFnt(writeFnt(f)).info.padding).toEqual({ up: 1, right: 2, down: 3, left: 4 });
  });

  it("roundtrips spacing (horizontal, vertical)", () => {
    const f = makeFont({ info: { ...makeFont().info, spacing: { horizontal: 3, vertical: 5 } } });
    expect(readFnt(writeFnt(f)).info.spacing).toEqual({ horizontal: 3, vertical: 5 });
  });

  it("roundtrips outline thickness", () => {
    const f = makeFont({ info: { ...makeFont().info, outline: 2 } });
    expect(readFnt(writeFnt(f)).info.outline).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Block type 2 – common
// ---------------------------------------------------------------------------

describe("writeFnt – common block (block type 2)", () => {
  it("roundtrips lineHeight, base, scaleW, scaleH", () => {
    const f = makeFont({ common: { lineHeight: 24, base: 19, scaleW: 256, scaleH: 512, pages: 1, packed: false, alphaChnl: 0, redChnl: 0, greenChnl: 0, blueChnl: 0 } });
    const c = readFnt(writeFnt(f)).common;
    expect(c).toMatchObject({ lineHeight: 24, base: 19, scaleW: 256, scaleH: 512 });
  });

  it("roundtrips pages count", () => {
    const f = makeFont({ pages: ["p0.png", "p1.png"], common: { lineHeight: 20, base: 16, scaleW: 128, scaleH: 128, pages: 2, packed: false, alphaChnl: 0, redChnl: 0, greenChnl: 0, blueChnl: 0 } });
    expect(readFnt(writeFnt(f)).common.pages).toBe(2);
  });

  it("roundtrips packed flag set", () => {
    const f = makeFont({ common: { ...makeFont().common, packed: true } });
    expect(readFnt(writeFnt(f)).common.packed).toBe(true);
  });

  it("roundtrips packed flag clear", () => {
    const f = makeFont({ common: { ...makeFont().common, packed: false } });
    expect(readFnt(writeFnt(f)).common.packed).toBe(false);
  });

  it("roundtrips all channel fields", () => {
    const f = makeFont({ common: { ...makeFont().common, alphaChnl: 4, redChnl: 1, greenChnl: 2, blueChnl: 3 } });
    expect(readFnt(writeFnt(f)).common).toMatchObject({ alphaChnl: 4, redChnl: 1, greenChnl: 2, blueChnl: 3 });
  });
});

// ---------------------------------------------------------------------------
// Block type 3 – pages
// ---------------------------------------------------------------------------

describe("writeFnt – pages block (block type 3)", () => {
  it("roundtrips a single page filename", () => {
    const f = makeFont({ pages: ["OpenSans-Regular-16.png"] });
    expect(readFnt(writeFnt(f)).pages).toEqual(["OpenSans-Regular-16.png"]);
  });

  it("roundtrips multiple pages with equal-length names", () => {
    const f = makeFont({ pages: ["page0.png", "page1.png"], common: { ...makeFont().common, pages: 2 } });
    expect(readFnt(writeFnt(f)).pages).toEqual(["page0.png", "page1.png"]);
  });

  it("roundtrips multiple pages with unequal-length names (padded to stride)", () => {
    const f = makeFont({ pages: ["a.png", "long-name.png"], common: { ...makeFont().common, pages: 2 } });
    expect(readFnt(writeFnt(f)).pages).toEqual(["a.png", "long-name.png"]);
  });

  it("encodes pages block sized as p * stride bytes", () => {
    const f = makeFont({ pages: ["ab.png", "cd.png"], common: { ...makeFont().common, pages: 2 } });
    const out = writeFnt(f);
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let off = 4;
    while (off < out.length && out[off] !== 3) off += 5 + v.getUint32(off + 1, true);
    const blockSize = v.getUint32(off + 1, true);
    // "ab.png" and "cd.png" are both 6 chars, stride = 7; 2 * 7 = 14
    expect(blockSize).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Block type 4 – chars
// ---------------------------------------------------------------------------

describe("writeFnt – chars block (block type 4)", () => {
  const sampleChars = [
    { id: 65, char: "A", x: 10, y: 20, width: 12, height: 14, xoffset: -1, yoffset: 6, xadvance: 11, page: 0, chnl: 15 },
    { id: 66, char: "B", x: 24, y: 20, width: 11, height: 14, xoffset:  0, yoffset: 6, xadvance: 12, page: 0, chnl: 15 },
  ];

  it("roundtrips char count (blockSize / 20)", () => {
    const f = makeFont({ chars: sampleChars });
    expect(readFnt(writeFnt(f)).chars).toHaveLength(2);
  });

  it("roundtrips id, x, y, width, height", () => {
    const f = makeFont({ chars: [sampleChars[0]] });
    const c = readFnt(writeFnt(f)).chars[0];
    expect(c).toMatchObject({ id: 65, x: 10, y: 20, width: 12, height: 14 });
  });

  it("roundtrips signed xoffset and yoffset", () => {
    const ch = { ...sampleChars[0], xoffset: -3, yoffset: -2 };
    expect(readFnt(writeFnt(makeFont({ chars: [ch] }))).chars[0]).toMatchObject({ xoffset: -3, yoffset: -2 });
  });

  it("roundtrips signed xadvance", () => {
    const ch = { ...sampleChars[0], xadvance: -1 };
    expect(readFnt(writeFnt(makeFont({ chars: [ch] }))).chars[0].xadvance).toBe(-1);
  });

  it("roundtrips page and chnl", () => {
    const ch = { ...sampleChars[0], page: 1, chnl: 8 };
    expect(readFnt(writeFnt(makeFont({ chars: [ch] }))).chars[0]).toMatchObject({ page: 1, chnl: 8 });
  });

  it("roundtrips char unicode mapping", () => {
    expect(readFnt(writeFnt(makeFont({ chars: [sampleChars[0]] }))).chars[0].char).toBe("A");
  });

  it("roundtrips a 4-byte unicode code point", () => {
    const emoji = { id: 0x1f600, char: "😀", x: 0, y: 0, width: 20, height: 20, xoffset: 0, yoffset: 0, xadvance: 20, page: 0, chnl: 15 };
    const c = readFnt(writeFnt(makeFont({ chars: [emoji] }))).chars[0];
    expect(c.id).toBe(0x1f600);
    expect(c.char).toBe("😀");
  });

  it("handles empty chars array", () => {
    expect(readFnt(writeFnt(makeFont({ chars: [] }))).chars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Block type 5 – kernings
// ---------------------------------------------------------------------------

describe("writeFnt – kernings block (block type 5)", () => {
  it("omits block 5 when kernings is empty", () => {
    expect(blockTypes(writeFnt(makeFont({ kernings: [] })))).toEqual([1, 2, 3, 4]);
  });

  it("includes block 5 when kernings is non-empty", () => {
    const f = makeFont({ kernings: [{ first: 84, firstChar: "T", second: 97, secondChar: "a", amount: -1 }] });
    expect(blockTypes(writeFnt(f))).toEqual([1, 2, 3, 4, 5]);
  });

  it("roundtrips first, second, firstChar, secondChar", () => {
    const f = makeFont({ kernings: [{ first: 89, firstChar: "Y", second: 65, secondChar: "A", amount: -2 }] });
    const k = readFnt(writeFnt(f)).kernings[0];
    expect(k).toMatchObject({ first: 89, firstChar: "Y", second: 65, secondChar: "A" });
  });

  it("roundtrips negative kerning amount", () => {
    const f = makeFont({ kernings: [{ first: 80, firstChar: "P", second: 44, secondChar: ",", amount: -2 }] });
    expect(readFnt(writeFnt(f)).kernings[0].amount).toBe(-2);
  });

  it("roundtrips positive kerning amount", () => {
    const f = makeFont({ kernings: [{ first: 40, firstChar: "(", second: 74, secondChar: "J", amount: 1 }] });
    expect(readFnt(writeFnt(f)).kernings[0].amount).toBe(1);
  });

  it("roundtrips multiple kerning pairs preserving order", () => {
    const pairs = [
      { first: 84, firstChar: "T", second: 97,  secondChar: "a", amount: -1 },
      { first: 89, firstChar: "Y", second: 65,  secondChar: "A", amount: -2 },
      { first: 40, firstChar: "(", second: 74,  secondChar: "J", amount:  1 },
    ];
    expect(readFnt(writeFnt(makeFont({ kernings: pairs }))).kernings).toEqual(pairs);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip – all real fonts
// ---------------------------------------------------------------------------

describe("writeFnt – roundtrip real fonts", () => {
  const fntFiles = fs.readdirSync(FONTS).filter(f => f.endsWith(".fnt")).sort();

  it.each(fntFiles)("%s roundtrips without data loss", (name) => {
    const original = readFont(name);
    const reparsed = readFnt(writeFnt(original));
    expect(reparsed).toEqual(original);
  });
});
