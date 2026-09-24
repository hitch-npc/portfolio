#!/usr/bin/env node
/**
 * Трекер — иконки
 * ───────────────
 * Рисует PNG-иконки приложения: iOS берёт для домашнего экрана только PNG
 * (apple-touch-icon), SVG ему не годится. Рисунок — четыре глифа сфер
 * (круг, пилюля, квадрат, полоса) чернилами на фоне приложения. Красного
 * в иконке нет: акцент значит «требует внимания сейчас», и только это.
 *
 * Пакетов нет: пиксели считаются с суперсэмплингом 4×4, PNG собирается
 * через zlib из Node. Запускается руками, результат коммитится.
 *
 *   node tooling/tracker-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tracker', 'icons');

const BG = [0xdb, 0xd8, 0xd3];
const INK = [0, 0, 0];

/* Фигуры в единицах 0…1 от стороны иконки. inset — поле вокруг композиции:
   у maskable-иконки система обрезает края, значимое должно лежать в круге 80 %. */
function shapes(inset) {
  const s = (v) => inset + v * (1 - 2 * inset);
  const circle = (cx, cy, r) => (x, y) => (x - s(cx)) ** 2 + (y - s(cy)) ** 2 <= (r * (1 - 2 * inset)) ** 2;
  const rect = (x0, y0, x1, y1) => (x, y) => x >= s(x0) && x <= s(x1) && y >= s(y0) && y <= s(y1);
  const pill = (x0, y0, x1, y1) => {
    const r = (y1 - y0) / 2;
    const a = circle(x0 + r, y0 + r, r);
    const b = circle(x1 - r, y0 + r, r);
    const m = rect(x0 + r, y0, x1 - r, y1);
    return (x, y) => a(x, y) || b(x, y) || m(x, y);
  };
  return [
    circle(0.3, 0.3, 0.17),
    pill(0.53, 0.2, 0.87, 0.4),
    rect(0.13, 0.57, 0.47, 0.87),
    rect(0.53, 0.67, 0.87, 0.77),
  ];
}

function draw(size, inset) {
  const figs = shapes(inset);
  const px = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (x + (sx + 0.5) / N) / size;
          const v = (y + (sy + 0.5) / N) / size;
          if (figs.some((f) => f(u, v))) hit++;
        }
      }
      const k = hit / (N * N);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - k) + INK[c] * k);
      px[i + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(size, rgba) {
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * row + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const ICONS = [
  { file: 'icon-180.png', size: 180, inset: 0.06 }, // iOS, домашний экран
  { file: 'icon-192.png', size: 192, inset: 0.06 },
  { file: 'icon-512.png', size: 512, inset: 0.06 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.16 },
];
for (const { file, size, inset } of ICONS) {
  writeFileSync(join(OUT, file), png(size, draw(size, inset)));
  console.log(`✓ tracker/icons/${file}`);
}
