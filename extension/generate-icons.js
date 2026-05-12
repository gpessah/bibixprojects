// Generate solid-color Bibix branded icons in PNG without external deps.
// Run: node generate-icons.js  (produces icons/icon16.png … icon128.png)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePNG(size) {
  // Build raw pixel data — RGBA, with a rounded purple square + white "B"
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const r = size * 0.46; // outer radius for rounded square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded square distance: chebyshev-clipped
      const dx = Math.abs(x - cx + 0.5);
      const dy = Math.abs(y - cy + 0.5);
      const cornerR = size * 0.18;
      let inside;
      if (dx < r - cornerR || dy < r - cornerR) {
        inside = dx < r && dy < r;
      } else {
        const ddx = dx - (r - cornerR);
        const ddy = dy - (r - cornerR);
        inside = Math.hypot(ddx, ddy) < cornerR;
      }
      if (!inside) { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0; continue; }
      // Gradient from #6366f1 (top) to #4338ca (bottom)
      const t = y / size;
      const R = Math.round(99 + (67 - 99) * t);
      const G = Math.round(102 + (56 - 102) * t);
      const B = Math.round(241 + (202 - 241) * t);
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;

      // White "B" — simple stylized: vertical bar + two D shapes
      const bw = size * 0.5;
      const bh = size * 0.55;
      const bx = cx - bw / 2;
      const by = cy - bh / 2;
      const lx = x - bx; const ly = y - by;
      if (lx >= 0 && lx < bw && ly >= 0 && ly < bh) {
        const stroke = Math.max(2, size * 0.10);
        const inVerticalBar = lx < stroke;
        const inTopBowl = (() => {
          const cyB = bh * 0.27;
          const rxB = bw * 0.78, ryB = bh * 0.27;
          const ndx = (lx) / rxB, ndy = (ly - cyB) / ryB;
          const outer = ndx * ndx + ndy * ndy <= 1;
          const rxBi = (bw * 0.78) - stroke, ryBi = (bh * 0.27) - stroke;
          const ndx2 = (lx) / rxBi, ndy2 = (ly - cyB) / ryBi;
          const inner = (rxBi > 0 && ryBi > 0) ? (ndx2 * ndx2 + ndy2 * ndy2 <= 1) : false;
          return outer && !inner && lx > stroke * 0.5;
        })();
        const inBottomBowl = (() => {
          const cyB = bh * 0.73;
          const rxB = bw * 0.85, ryB = bh * 0.30;
          const ndx = (lx) / rxB, ndy = (ly - cyB) / ryB;
          const outer = ndx * ndx + ndy * ndy <= 1;
          const rxBi = rxB - stroke, ryBi = ryB - stroke;
          const ndx2 = (lx) / rxBi, ndy2 = (ly - cyB) / ryBi;
          const inner = (rxBi > 0 && ryBi > 0) ? (ndx2 * ndx2 + ndy2 * ndy2 <= 1) : false;
          return outer && !inner && lx > stroke * 0.5;
        })();
        if (inVerticalBar || inTopBowl || inBottomBowl) {
          px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
        }
      }
    }
  }

  // PNG: signature + IHDR + IDAT + IEND
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Add a filter byte (0 = None) at the start of each scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
for (const s of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${s}.png`), makePNG(s));
  console.log(`wrote icons/icon${s}.png`);
}
