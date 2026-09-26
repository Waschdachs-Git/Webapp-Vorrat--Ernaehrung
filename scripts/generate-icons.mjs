// Generates the PWA PNG icons (192, 512, and the 180px apple-touch-icon)
// without any image libraries: raw RGBA pixels -> zlib -> minimal PNG.
// The mark is a calorie-ring motif (accent-green field, off-white ring),
// matching the app's design language.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
mkdirSync(PUBLIC, { recursive: true });

const BG = [36, 122, 78]; // accent green
const RING = [250, 248, 244]; // warm off-white

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.34;
  const inner = size * 0.21;
  const radius = size * 0.18; // rounded-corner mask

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4 + 1);
    row[0] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const o = 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inRing = dist <= outer && dist >= inner;
      const color = inRing ? RING : BG;

      // Rounded-rect alpha mask for a maskable-friendly squircle look.
      const ax = Math.max(0, Math.abs(dx) - (cx - radius));
      const ay = Math.max(0, Math.abs(dy) - (cy - radius));
      const cornerDist = Math.sqrt(ax * ax + ay * ay);
      const alpha = cornerDist <= radius ? 255 : 0;

      row[o] = color[0];
      row[o + 1] = color[1];
      row[o + 2] = color[2];
      row[o + 3] = alpha;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(PUBLIC, name), makePng(size));
  console.log('wrote', name);
}

// A simple SVG favicon (same motif, vector).
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#247a4e"/>
  <circle cx="32" cy="32" r="17" fill="none" stroke="#faf8f4" stroke-width="7"/>
</svg>`;
writeFileSync(join(PUBLIC, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');
