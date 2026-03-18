/**
 * Removes gray background from units.png via flood-fill from corners.
 * Seeds from all 4 image corners + all 8 cell corners (4x2 grid).
 * Marks connected opaque gray-ish pixels as transparent.
 * Outputs units_nobg.png in the same folder.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── CRC32 ────────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf, start = 0, end = buf.length) {
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG parse ────────────────────────────────────────────────────────────────
function readPng(filepath) {
  const buf = fs.readFileSync(filepath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || colorType !== 6) throw new Error('Only 8-bit RGBA PNGs supported');

  const idatChunks = [];
  let offset = 8;
  while (offset < buf.length - 12) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(buf.slice(offset + 8, offset + 8 + len));
    if (type === 'IEND') break;
    offset += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowSize = 1 + w * 4;
  const rgba = new Uint8Array(w * h * 4);

  // Un-filter each row
  for (let y = 0; y < h; y++) {
    const filterType = raw[y * rowSize];
    const rowStart = y * rowSize + 1;
    const prevRowDst = (y - 1) * w * 4;
    const rowDst = y * w * 4;

    for (let x = 0; x < w; x++) {
      const src = rowStart + x * 4;
      const dst = rowDst + x * 4;

      for (let c = 0; c < 4; c++) {
        let v = raw[src + c];
        const a = x > 0 ? rgba[dst - 4 + c] : 0;
        const b = y > 0 ? rgba[prevRowDst + x * 4 + c] : 0;
        const d = (y > 0 && x > 0) ? rgba[prevRowDst + (x - 1) * 4 + c] : 0;

        if      (filterType === 1) v = (v + a) & 0xFF;
        else if (filterType === 2) v = (v + b) & 0xFF;
        else if (filterType === 3) v = (v + Math.floor((a + b) / 2)) & 0xFF;
        else if (filterType === 4) {
          const p = a + b - d;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - d);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : d;
          v = (v + pr) & 0xFF;
        }
        rgba[dst + c] = v;
      }
    }
  }

  return { w, h, rgba };
}

// ── PNG write ────────────────────────────────────────────────────────────────
function writePng(filepath, w, h, rgba) {
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth=8, colorType=6 (RGBA)

  // Raw rows: filter type 0 (None) + RGBA data
  const rowSize = 1 + w * 4;
  const rawRows = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    rawRows[y * rowSize] = 0; // filter type None
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * rowSize + 1 + x * 4;
      rawRows[dst]     = rgba[src];
      rawRows[dst + 1] = rgba[src + 1];
      rawRows[dst + 2] = rgba[src + 2];
      rawRows[dst + 3] = rgba[src + 3];
    }
  }

  const compressed = zlib.deflateSync(rawRows, { level: 6 });

  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  fs.writeFileSync(filepath, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]));
}

// ── Background removal via flood-fill ────────────────────────────────────────
function isGrayBackground(r, g, b, a) {
  if (a < 250) return false; // already transparent-ish
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  return maxDiff < 25 && r > 50; // gray-ish or near-white background
}

function floodFill(rgba, w, h, seeds) {
  const visited = new Uint8Array(w * h);
  const queue = [];

  for (const [sx, sy] of seeds) {
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const idx = sy * w + sx;
    if (visited[idx]) continue;
    const ri = idx * 4;
    if (!isGrayBackground(rgba[ri], rgba[ri+1], rgba[ri+2], rgba[ri+3])) continue;
    visited[idx] = 1;
    queue.push(idx);
  }

  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx % w, y = Math.floor(idx / w);
    rgba[idx * 4 + 3] = 0; // make transparent

    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      const ri = ni * 4;
      if (!isGrayBackground(rgba[ri], rgba[ri+1], rgba[ri+2], rgba[ri+3])) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }

  console.log('Flood-fill removed', queue.length, 'background pixels');
}

// ── Main ─────────────────────────────────────────────────────────────────────
const inPath  = path.join(__dirname, '../assets/sprites/units.png');
const outPath = path.join(__dirname, '../assets/sprites/units_nobg.png');

console.log('Reading', inPath);
const { w, h, rgba } = readPng(inPath);
console.log('Image:', w, 'x', h);

const cw = w / 4, ch = h / 2;

// Seed from image corners + all cell corners
const seeds = [
  [0, 0], [w-1, 0], [0, h-1], [w-1, h-1],
];
for (let row = 0; row <= 2; row++) {
  for (let col = 0; col <= 4; col++) {
    const sx = Math.min(col * cw, w - 1);
    const sy = Math.min(row * ch, h - 1);
    // Seed a small border around each cell boundary
    for (let d = 0; d < 3; d++) {
      seeds.push([sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d]);
    }
  }
}

floodFill(rgba, w, h, seeds);

console.log('Writing', outPath);
writePng(outPath, w, h, rgba);
console.log('Done.');
