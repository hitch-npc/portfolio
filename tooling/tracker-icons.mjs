#!/usr/bin/env node
/**
 * Трекер — иконки и зерно
 * ───────────────────────
 * Рисует PNG-иконки приложения: iOS берёт для домашнего экрана только PNG
 * (apple-touch-icon), SVG ему не годится. Рисунок — логотип 3_TRACK:
 * композиция дня с экрана Today, собранная в квадрат, — красная пилюля
 * (задача, которая сейчас), чёрная (следующая) и штрихованный круг (пустое
 * место) на точечном поле в уголках-метках, как на чертеже.
 *
 * Ещё — плитки бумажного зерна (tracker/textures/grain.png; grain-dark.png —
 * для тёмной темы): крупинки с едва заметной прозрачностью, в три раза
 * плотнее экрана. Картинка, а не SVG-фильтр: политика
 * безопасности страницы не пускает data:-адреса, а шум на лету дорог для телефона.
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
const MUTED = [0x91, 0x8e, 0x8b];
const ACCENT = [0xe5, 0x29, 0x28];

/* Логотип в единицах 0…1 от стороны иконки. inset — поле вокруг композиции:
   у maskable-иконки система обрезает края, значимое должно лежать в круге 80 %.
   Пропорции — почти как на Today: пилюля 0.575 : 1, круг — 0.4 её высоты
   (штриховка крупнее: на домашнем экране иконка — 60 pt),
   точки — шаг в шестую часть ширины пилюли. */
function logo(inset) {
  const s = (v) => inset + v * (1 - 2 * inset);
  const k = 1 - 2 * inset;
  const inCircle = (cx, cy, r) => (x, y) => (x - s(cx)) ** 2 + (y - s(cy)) ** 2 <= (r * k) ** 2;
  const inRect = (x0, y0, x1, y1) => (x, y) => x >= s(x0) && x <= s(x1) && y >= s(y0) && y <= s(y1);
  const pill = (x0, y0, x1, y1) => {
    const r = (x1 - x0) / 2;
    const a = inCircle(x0 + r, y0 + r, r);
    const b = inCircle(x0 + r, y1 - r, r);
    const m = inRect(x0, y0 + r, x1, y1 - r);
    return (x, y) => a(x, y) || b(x, y) || m(x, y);
  };
  // уголки-метки
  const F = 0.11; // от края
  const ARM = 0.08;
  const W = 0.016; // толщина
  const marks = [];
  for (const [cx, dx] of [[F, 1], [1 - F, -1]]) {
    for (const [cy, dy] of [[F, 1], [1 - F, -1]]) {
      const x0 = Math.min(cx, cx + dx * ARM), x1 = Math.max(cx, cx + dx * ARM);
      const y0 = Math.min(cy, cy + dy * ARM), y1 = Math.max(cy, cy + dy * ARM);
      marks.push(inRect(x0, Math.min(cy, cy + dy * W), x1, Math.max(cy, cy + dy * W)));
      marks.push(inRect(Math.min(cx, cx + dx * W), y0, Math.max(cx, cx + dx * W), y1));
    }
  }
  const PW = 0.21; // ширина пилюли
  const PH = PW / 0.575;
  const top = 0.5 - PH / 2;
  const red = pill(0.155, top, 0.155 + PW, top + PH);
  const black = pill(0.425, top, 0.425 + PW, top + PH);
  const R = 0.075;
  const hole = inCircle(0.845 - R, 0.5, R);
  const PITCH = PW / 6;
  const DOT = 0.0042;
  const LINES = (2 * R * k) / 5.5; // штриховка: пять с половиной шагов на круг
  return (x, y) => {
    if (marks.some((m) => m(x, y))) return INK;
    if (red(x, y)) return ACCENT;
    if (black(x, y)) return INK;
    if (hole(x, y)) {
      // «/» — как repeating-linear-gradient(-45deg) у пустого места
      const d = (x + y) / Math.SQRT2;
      return (((d / LINES) % 1) + 1) % 1 < 0.28 ? MUTED : BG;
    }
    const u = (x - s(F)) / (PITCH * k), v = (y - s(F)) / (PITCH * k);
    const end = (1 - 2 * F) / PITCH - 0.5;
    if (u > 0.5 && v > 0.5 && u < end && v < end) {
      const du = (u - Math.round(u)) * PITCH * k, dv = (v - Math.round(v)) * PITCH * k;
      if (du * du + dv * dv <= (DOT * k) ** 2) return MUTED;
    }
    return BG;
  };
}

function draw(size, inset) {
  const paint = logo(inset);
  const px = Buffer.alloc(size * size * 4);
  const N = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = paint((x + (sx + 0.5) / N) / size, (y + (sy + 0.5) / N) / size);
          for (let i = 0; i < 3; i++) sum[i] += c[i];
        }
      }
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(sum[c] / (N * N));
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

/*
 * Зерно: детерминированный шум (одинаковый при каждом запуске — без лишних
 * диффов). Плитка в три раза плотнее, чем показывается (384 px на 128 pt):
 * на экране iPhone одна крупинка — один пиксель, а не квадрат 3×3. Шум чуть
 * размыт по кругу (плитка без шва) — крупинки разного размера, как у плёнки;
 * тёмные и изредка светлые — как у бумаги.
 */
const GRAIN = 384;

function grain(size, dark = false) {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let v = new Float32Array(size * size).map(() => rand() + rand() - 1);
  // один проход [1 2 1]/4 по строкам и столбцам, с заворотом через край:
  // крупинки мягкие, но не слипаются в пятна
  const at = (x, y) => ((y + size) % size) * size + ((x + size) % size);
  for (let pass = 0; pass < 1; pass++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const out = new Float32Array(v.length);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          out[at(x, y)] = (v[at(x - dx, y - dy)] + 2 * v[at(x, y)] + v[at(x + dx, y + dy)]) / 4;
        }
      }
      v = out;
    }
  }
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  // тёмная тема — наоборот: частые крупинки светлые, редкие тёмные, и чуть
  // слабее (0.7): светлое на тёмном заметнее
  const [often, rare, k] = dark ? [255, 0, 0.7] : [0, 255, 1];
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < v.length; i++) {
    const z = (v[i] - mean) / sd;
    if (z > 0.2) {
      px.fill(often, i * 4, i * 4 + 3);
      px[i * 4 + 3] = Math.round(k * Math.min(22, Math.round((z - 0.2) * 11)));
    } else if (z < -1.3) {
      px.fill(rare, i * 4, i * 4 + 3); // реже и слабее
      px[i * 4 + 3] = Math.round(k * Math.min(12, Math.round((-z - 1.3) * 10)));
    }
  }
  return px;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(join(ROOT, 'tracker', 'textures'), { recursive: true });
writeFileSync(join(ROOT, 'tracker', 'textures', 'grain.png'), png(GRAIN, grain(GRAIN)));
writeFileSync(join(ROOT, 'tracker', 'textures', 'grain-dark.png'), png(GRAIN, grain(GRAIN, true)));
console.log('✓ tracker/textures/grain.png, grain-dark.png');

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
