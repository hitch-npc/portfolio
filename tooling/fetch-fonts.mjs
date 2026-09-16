#!/usr/bin/env node
/**
 * Забирает шрифты с Google Fonts в репозиторий. Запускается руками, один раз
 * на смену набора: на витрине браузер посетителя к Google не ходит — ни за
 * CSS, ни за файлами, и IP зрителя в Google не уезжает (GDPR).
 *
 * Берём ровно то, что отдаёт Google современному браузеру: переменные woff2,
 * порезанные по unicode-range. Подмножества — только нужные сайту: latin для
 * текста, cyrillic и оба -ext ради ₽ и № в кейсе. Браузер скачивает
 * подмножество, лишь когда на странице есть символ из его диапазона, так что
 * лишние файлы зрителю ничего не стоят.
 *
 *   node tooling/fetch-fonts.mjs
 *
 * Пишет public/fonts/*.woff2, лицензии OFL рядом и src/styles/fonts.css.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'fonts');
const CSS_OUT = join(ROOT, 'src', 'styles', 'fonts.css');

// те же запросы, что стояли в <head>; каталог — папка семейства в google/fonts
const FAMILIES = [
  { css: 'Archivo:wdth,wght@62..125,100..900', dir: 'archivo' },
  { css: 'Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500', dir: 'cormorantgaramond' },
  { css: 'Oranienbaum', dir: 'oranienbaum' },
  { css: 'Forum', dir: 'forum' },
  { css: 'Manrope:wght@300;400;500;600;700', dir: 'manrope' },
];

const SUBSETS = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']);

// без современного UA Google отдаёт ttf вместо woff2
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const get = async (url, as) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'buf' ? Buffer.from(await res.arrayBuffer()) : res.text();
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const prop = (block, name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const faces = [];
const files = new Map(); // url → имя файла: у переменного шрифта один файл на несколько весов
let bytes = 0;

for (const fam of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`);

  for (const [, subset, block] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
    if (!SUBSETS.has(subset)) continue;

    const family = prop(block, 'font-family').replace(/['"]/g, '');
    const style = prop(block, 'font-style');
    const weight = prop(block, 'font-weight');
    const stretch = prop(block, 'font-stretch');
    const range = prop(block, 'unicode-range');
    const url = block.match(/url\(([^)]+)\)/)[1];

    if (!files.has(url)) {
      // статичные начертания различаем весом, переменные — одним файлом
      const base = `${slug(family)}-${style}-${subset}`;
      const taken = [...files.values()].includes(`${base}.woff2`);
      const name = taken ? `${base}-${slug(weight)}.woff2` : `${base}.woff2`;
      const buf = await get(url, 'buf');
      writeFileSync(join(OUT_DIR, name), buf);
      files.set(url, name);
      bytes += buf.length;
    }

    faces.push(
      `/* ${family} ${style} ${weight} — ${subset} */\n@font-face {\n` +
      `  font-family: '${family}';\n  font-style: ${style};\n  font-weight: ${weight};\n` +
      (stretch ? `  font-stretch: ${stretch};\n` : '') +
      `  font-display: swap;\n  src: url('/fonts/${files.get(url)}') format('woff2');\n` +
      `  unicode-range: ${range};\n}\n`,
    );
  }

  const license = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${fam.dir}/OFL.txt`);
  writeFileSync(join(OUT_DIR, `${fam.dir}-OFL.txt`), license);
}

writeFileSync(
  CSS_OUT,
  `/* Шрифты лежат на самом сайте: public/fonts. Файл генерируется —\n` +
  `   node tooling/fetch-fonts.mjs, руками не править. Лицензии — SIL OFL 1.1, рядом со шрифтами. */\n\n` +
  faces.join('\n'),
);

console.log(`✓ ${files.size} woff2 (${(bytes / 1024).toFixed(0)} КБ), ${faces.length} @font-face → src/styles/fonts.css`);
