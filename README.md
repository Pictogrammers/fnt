# @pictogrammers/fnt

Parse and serialize the [AngelCode BMFont](https://www.angelcode.com/products/bmfont/doc/file_format.html) binary format (`.fnt`).

Supports Node.js and the browser. No runtime dependencies.

## Install

```sh
npm install @pictogrammers/fnt
```

## API

```ts
import { readFnt, writeFnt } from '@pictogrammers/fnt';

readFnt(input: Uint8Array | ArrayBuffer): FntFont
writeFnt(font: FntFont): Uint8Array
```

### `FntFont`

```ts
interface FntFont {
  info: FntInfo;       // face name, size, flags, padding, spacing
  common: FntCommon;   // line height, texture dimensions, channel layout
  pages: string[];     // texture filenames, one per page
  chars: FntChar[];    // per-glyph texture coordinates and metrics
  kernings: FntKerning[];
}
```

See [`shared.ts`](./shared.ts) for the full type definitions.

---

## Node.js

### Read a font

```ts
import { readFileSync } from 'fs';
import { readFnt } from '@pictogrammers/fnt';

const font = readFnt(readFileSync('OpenSans-Regular-16.fnt'));

console.log(font.info.face);        // "Open Sans"
console.log(font.info.fontSize);    // -13163  (Windows LOGFONT signed height)
console.log(font.common.lineHeight); // 21
console.log(font.pages);            // ["OpenSans-Regular-16.png"]
console.log(font.chars.length);     // 95
console.log(font.kernings.length);  // 23
```

### Inspect glyphs

```ts
// Find the metrics for a specific character
const glyph = font.chars.find(c => c.char === 'A');
if (glyph) {
  console.log(glyph.x, glyph.y);           // position in texture atlas
  console.log(glyph.width, glyph.height);  // size in texture atlas
  console.log(glyph.xoffset, glyph.yoffset, glyph.xadvance);
}

// Get kerning between two characters
const kern = font.kernings.find(k => k.firstChar === 'T' && k.secondChar === 'a');
console.log(kern?.amount); // -1
```

### Write a font

```ts
import { readFileSync, writeFileSync } from 'fs';
import { readFnt, writeFnt } from '@pictogrammers/fnt';

const font = readFnt(readFileSync('OpenSans-Regular-16.fnt'));

// Modify and write back
font.info.outline = 1;

writeFileSync('OpenSans-Regular-16-modified.fnt', writeFnt(font));
```

### Convert to JSON

```ts
import { readFileSync, writeFileSync } from 'fs';
import { readFnt } from '@pictogrammers/fnt';

const font = readFnt(readFileSync('OpenSans-Regular-16.fnt'));
writeFileSync('OpenSans-Regular-16.json', JSON.stringify(font, null, 2));
```

---

## Web

### Read via `fetch`

```ts
import { readFnt } from '@pictogrammers/fnt';

const font = readFnt(await fetch('fonts/OpenSans-Regular-16.fnt').then(r => r.arrayBuffer()));

console.log(font.info.face);         // "Open Sans"
console.log(font.common.lineHeight); // 21
```

### Read via file picker

```ts
import { readFnt } from '@pictogrammers/fnt';

async function openFont() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'BMFont', accept: { 'application/octet-stream': ['.fnt'] } }],
  });
  const file = await handle.getFile();
  return readFnt(await file.arrayBuffer());
}

const font = await openFont();
console.log(font.info.face);
```

### Write via file picker (save)

```ts
import { writeFnt } from '@pictogrammers/fnt';

async function saveFont(font) {
  const handle = await window.showSaveFilePicker({
    suggestedName: 'font.fnt',
    types: [{ description: 'BMFont', accept: { 'application/octet-stream': ['.fnt'] } }],
  });
  const writable = await handle.createWritable();
  await writable.write(writeFnt(font));
  await writable.close();
}
```

### Write via download link

```ts
import { writeFnt } from '@pictogrammers/fnt';

function downloadFont(font, filename = 'font.fnt') {
  const url = URL.createObjectURL(new Blob([writeFnt(font)], { type: 'application/octet-stream' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
```
