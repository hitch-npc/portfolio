#!/usr/bin/env node
/**
 * Трекер — шрифт
 * ──────────────
 * Забирает Inter Tight с Google Fonts в tracker/fonts. Запускается руками,
 * один раз на смену шрифта: приложение работает офлайн, и браузер к Google
 * не ходит ни за CSS, ни за файлами.
 *
 * Inter Tight, а не Switzer: у Switzer нет кириллицы, а задачи пишутся
 * по-русски. Лицензия SIL OFL 1.1 разрешает держать файлы в публичном
 * репозитории — лицензия лежит рядом.
 *
 * Подмножества — latin и cyrillic с их -ext: браузер скачивает файл, только
 * когда на странице есть символ из его диапазона.
 *
 *   node tooling/tracker-fonts.mjs
 *
 * Пишет tracker/fonts/*.woff2, OFL.txt и tracker/fonts/fonts.css.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'tracker', 'fonts');

const FAMILY = { css: 'Inter+Tight:wght@400..800', dir: 'intertight', file: 'inter-tight' };
const SUBSETS = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']);

// без современного UA Google отдаёт ttf вместо woff2
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const get = async (url, as) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'buf' ? Buffer.from(await res.arrayBuffer()) : res.text();
};

const prop = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const css = await get(`https://fonts.googleapis.com/css2?family=${FAMILY.css}&display=swap`);
const faces = [];
let bytes = 0;

for (const [, subset, block] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
  if (!SUBSETS.has(subset)) continue;
  const name = `${FAMILY.file}-${subset}.woff2`;
  const buf = await get(block.match(/url\(([^)]+)\)/)[1], 'buf');
  writeFileSync(join(OUT_DIR, name), buf);
  bytes += buf.length;
  faces.push(
    `/* ${subset} */\n@font-face {\n  font-family: 'Inter Tight';\n  font-style: normal;\n` +
    `  font-weight: ${prop(block, 'font-weight')};\n  font-display: swap;\n` +
    `  src: url('${name}') format('woff2');\n  unicode-range: ${prop(block, 'unicode-range')};\n}\n`,
  );
}

writeFileSync(join(OUT_DIR, 'OFL.txt'), await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${FAMILY.dir}/OFL.txt`));
writeFileSync(
  join(OUT_DIR, 'fonts.css'),
  `/* Inter Tight, SIL OFL 1.1 (лицензия — OFL.txt рядом). Файл генерируется —\n` +
  `   node tooling/tracker-fonts.mjs, руками не править. */\n\n` +
  faces.join('\n'),
);

console.log(`✓ ${faces.length} woff2 (${(bytes / 1024).toFixed(0)} КБ) → tracker/fonts`);
