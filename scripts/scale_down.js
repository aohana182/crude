/**
 * Scales units_nobg.png down to 1/4 size (704x384) using bilinear interpolation.
 * Output: units_nobg.png (overwrites in place)
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function readPng(filepath) {
  const buf = fs.readFileSync(filepath);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  let idatChunks = [], offset = 8;
  while (offset < buf.length - 12) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset+4, offset+8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(buf.slice(offset+8, offset+8+len));
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowSize = 1 + w * 4;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const filterType = raw[y * rowSize];
    const rowDst = y * w * 4;
    const prevRowDst = (y-1) * w * 4;
    for (let x = 0; x < w; x++) {
      const src = y * rowSize + 1 + x * 4;
      const dst = rowDst + x * 4;
      for (let c = 0; c < 4; c++) {
        let v = raw[src + c];
        const a = x > 0 ? rgba[dst-4+c] : 0;
        const b = y > 0 ? rgba[prevRowDst+x*4+c] : 0;
        const d = (y > 0 && x > 0) ? rgba[prevRowDst+(x-1)*4+c] : 0;
        if      (filterType === 1) v = (v + a) & 0xFF;
        else if (filterType === 2) v = (v + b) & 0xFF;
        else if (filterType === 3) v = (v + Math.floor((a+b)/2)) & 0xFF;
        else if (filterType === 4) {
          const p=a+b-d, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-d);
          v = (v + (pa<=pb&&pa<=pc?a:pb<=pc?b:d)) & 0xFF;
        }
        rgba[dst+c] = v;
      }
    }
  }
  return { w, h, rgba };
}

function writePng(filepath, w, h, rgba) {
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([lenBuf, t, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8]=8; ihdr[9]=6;
  const rowSize = 1 + w*4;
  const rawRows = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    rawRows[y*rowSize] = 0;
    for (let x = 0; x < w; x++) {
      const s=(y*w+x)*4, d=y*rowSize+1+x*4;
      rawRows[d]=rgba[s]; rawRows[d+1]=rgba[s+1]; rawRows[d+2]=rgba[s+2]; rawRows[d+3]=rgba[s+3];
    }
  }
  const compressed = zlib.deflateSync(rawRows, { level: 6 });
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  fs.writeFileSync(filepath, Buffer.concat([sig, chunk('IHDR',ihdr), chunk('IDAT',compressed), chunk('IEND',Buffer.alloc(0))]));
}

// Bilinear downscale
function downscale(rgba, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 4);
  const scaleX = srcW / dstW, scaleY = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * scaleX, sy = dy * scaleY;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0+1, srcW-1), y1 = Math.min(y0+1, srcH-1);
      const fx = sx - x0, fy = sy - y0;
      const dst = (dy*dstW+dx)*4;
      for (let c = 0; c < 4; c++) {
        const tl = rgba[(y0*srcW+x0)*4+c];
        const tr = rgba[(y0*srcW+x1)*4+c];
        const bl = rgba[(y1*srcW+x0)*4+c];
        const br = rgba[(y1*srcW+x1)*4+c];
        out[dst+c] = Math.round(tl*(1-fx)*(1-fy) + tr*fx*(1-fy) + bl*(1-fx)*fy + br*fx*fy);
      }
    }
  }
  return out;
}

const inPath = path.join(__dirname, '../assets/sprites/units_nobg.png');
console.log('Reading', inPath);
const { w, h, rgba } = readPng(inPath);
console.log('Source:', w, 'x', h);

const dstW = Math.round(w / 4), dstH = Math.round(h / 4);
console.log('Scaling to:', dstW, 'x', dstH);
const scaled = downscale(rgba, w, h, dstW, dstH);

writePng(inPath, dstW, dstH, scaled);
console.log('Done. Cell size:', dstW/4, 'x', dstH/2);
