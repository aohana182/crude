/**
 * Extracts 8 individual unit PNGs from units_nobg.png (704x384, 4x2 grid, 176x192 per cell).
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
  let idat = [], offset = 8;
  while (offset < buf.length - 12) {
    const len = buf.readUInt32BE(offset);
    const type = buf.slice(offset+4, offset+8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.slice(offset+8, offset+8+len));
    if (type === 'IEND') break;
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rowSize = 1 + w * 4;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * rowSize], rd = y * w * 4, pr = (y-1) * w * 4;
    for (let x = 0; x < w; x++) {
      const src = y * rowSize + 1 + x * 4, dst = rd + x * 4;
      for (let c = 0; c < 4; c++) {
        let v = raw[src+c];
        const a = x>0?rgba[dst-4+c]:0, b = y>0?rgba[pr+x*4+c]:0, d = (y>0&&x>0)?rgba[pr+(x-1)*4+c]:0;
        if      (ft===1) v=(v+a)&0xFF;
        else if (ft===2) v=(v+b)&0xFF;
        else if (ft===3) v=(v+Math.floor((a+b)/2))&0xFF;
        else if (ft===4) { const p=a+b-d,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-d); v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:d))&0xFF; }
        rgba[dst+c]=v;
      }
    }
  }
  return { w, h, rgba };
}

function writePng(filepath, w, h, rgba) {
  function chunk(type, data) {
    const t = Buffer.from(type,'ascii'), lb = Buffer.alloc(4), cb = Buffer.alloc(4);
    lb.writeUInt32BE(data.length); cb.writeUInt32BE(crc32(Buffer.concat([t,data])));
    return Buffer.concat([lb,t,data,cb]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const rs = 1+w*4, rr = Buffer.alloc(h*rs);
  for (let y=0;y<h;y++) { rr[y*rs]=0; for(let x=0;x<w;x++){const s=(y*w+x)*4,d=y*rs+1+x*4; rr[d]=rgba[s];rr[d+1]=rgba[s+1];rr[d+2]=rgba[s+2];rr[d+3]=rgba[s+3];} }
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  fs.writeFileSync(filepath, Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rr,{level:6})),chunk('IEND',Buffer.alloc(0))]));
}

const src = path.join(__dirname,'../assets/sprites/units_nobg.png');
const { w, h, rgba } = readPng(src);
const cols = 4, rows = 2;
const cw = Math.floor(w/cols), ch = Math.floor(h/rows);
console.log(`Sheet: ${w}x${h}, cell: ${cw}x${ch}`);

const names = [
  ['coalition_t0','coalition_t1','coalition_t2','coalition_t3'],
  ['insurgents_t0','insurgents_t1','insurgents_t2','insurgents_t3'],
];

for (let row=0;row<rows;row++) {
  for (let col=0;col<cols;col++) {
    const cell = new Uint8Array(cw*ch*4);
    for (let y=0;y<ch;y++) {
      for (let x=0;x<cw;x++) {
        const s = ((row*ch+y)*w + (col*cw+x))*4;
        const d = (y*cw+x)*4;
        cell[d]=rgba[s]; cell[d+1]=rgba[s+1]; cell[d+2]=rgba[s+2]; cell[d+3]=rgba[s+3];
      }
    }
    const outPath = path.join(__dirname,'../assets/sprites/'+names[row][col]+'.png');
    writePng(outPath, cw, ch, cell);
    console.log('Wrote', path.basename(outPath));
  }
}
console.log('Done.');
