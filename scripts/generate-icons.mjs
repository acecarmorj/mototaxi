import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const WHITE = [0xff, 0xff, 0xff];
const RED = [0xe1, 0x1d, 0x2e];
const RED_DEEP = [0xb9, 0x1c, 0x1c];
const INK = [0x11, 0x11, 0x11];
const BG = [0xfa, 0xfa, 0xfa];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function pngRgb(width, height, getPixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, y);
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size) {
  const cx = size / 2;
  const cy = size / 2;
  const badge = size * 0.34;
  const radius = size * 0.08;
  const stroke = Math.max(2, size * 0.028);

  return pngRgb(size, size, (x, y) => {
    if (x < 0 || y < 0) return BG;

    const dx = Math.abs(x - cx) - (badge - radius);
    const dy = Math.abs(y - cy) - (badge - radius);
    const odx = Math.max(dx, 0);
    const ody = Math.max(dy, 0);
    const dist = Math.sqrt(odx * odx + ody * ody) + Math.min(Math.max(dx, dy), 0);
    const inside = dist <= radius;
    const border = inside && dist > radius - stroke * 1.4;

    if (border) return RED_DEEP;
    if (inside) {
      const motoY = cy + size * 0.04;
      const wheelR = size * 0.055;
      const leftWheel = inCircle(x, y, cx - size * 0.12, motoY + size * 0.06, wheelR);
      const rightWheel = inCircle(x, y, cx + size * 0.12, motoY + size * 0.06, wheelR);
      const innerL = inCircle(x, y, cx - size * 0.12, motoY + size * 0.06, wheelR - stroke * 0.7);
      const innerR = inCircle(x, y, cx + size * 0.12, motoY + size * 0.06, wheelR - stroke * 0.7);
      if ((leftWheel && !innerL) || (rightWheel && !innerR)) return WHITE;

      const body =
        y > motoY - size * 0.08 &&
        y < motoY + size * 0.02 &&
        x > cx - size * 0.1 &&
        x < cx + size * 0.08;
      const stem =
        y > motoY - size * 0.14 &&
        y < motoY - size * 0.06 &&
        x > cx - size * 0.12 &&
        x < cx - size * 0.02;
      if (body || stem) return WHITE;
      return RED;
    }

    const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / (size * 0.12);
    if (edge < 1) return lerp(BG, WHITE, Math.max(0, 1 - edge));
    return BG;
  });
}

await mkdir(outDir, { recursive: true });
const files = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of files) {
  const buf = drawIcon(size);
  const dest = join(outDir, name);
  createWriteStream(dest).end(buf);
  console.log("wrote", dest, buf.length, "bytes");
}
