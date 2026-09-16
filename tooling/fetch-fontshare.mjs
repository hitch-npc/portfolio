#!/usr/bin/env node
/**
 * Шрифты Fontshare (Gambarino, Switzer) — только на сайте, не в репозитории.
 *
 * Лицензия ITF FFL 2.0 разрешает держать шрифты на своём сайте, но запрещает
 * распространять файлы через репозитории и публичные хранилища, а также
 * менять их — в том числе резать на подмножества и конвертировать. Репозиторий
 * портфолио публичный, поэтому файлы в git не коммитятся (.gitignore), а
 * сборка забирает официальные woff2 у Fontshare как есть и кладёт рядом со
 * страницей. @font-face для них — в src/styles/fonts-fontshare.css.
 *
 *   node tooling/fetch-fontshare.mjs          # скачать, если файлов ещё нет
 *   node tooling/fetch-fontshare.mjs --force  # скачать заново
 *
 * Скачать не вышло и файлов нет — сборка падает: витрина без своих шрифтов
 * хуже, чем витрина вчерашняя.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'fonts', 'fontshare');
const FORCE = process.argv.includes('--force');

// запрос к API Fontshare → имя файла на сайте. switzer@1 — переменный 100–900
const FACES = [
  { query: 'gambarino@400', file: 'gambarino-regular.woff2' },
  { query: 'switzer@1', file: 'switzer-variable.woff2' },
  { query: 'switzer@2', file: 'switzer-variable-italic.woff2' },
];

const API = 'https://api.fontshare.com/v2/css';

async function fetchFace({ query, file }) {
  const target = join(OUT_DIR, file);
  if (!FORCE && existsSync(target)) return { file, cached: true };

  const css = await (await fetch(`${API}?f[]=${query}&display=swap`)).text();
  const src = css.match(/url\('([^']+\.woff2)'\)/)?.[1];
  if (!src) throw new Error(`Fontshare не отдал woff2 для ${query}`);

  const res = await fetch(src.startsWith('//') ? `https:${src}` : src);
  if (!res.ok) throw new Error(`${res.status} при загрузке ${query}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(target, buf);
  return { file, bytes: buf.length };
}

mkdirSync(OUT_DIR, { recursive: true });

try {
  for (const face of FACES) {
    const r = await fetchFace(face);
    console.log(r.cached ? `· ${r.file} — уже есть` : `✓ ${r.file} (${(r.bytes / 1024).toFixed(0)} КБ)`);
  }
} catch (err) {
  console.error(`✗ Шрифты Fontshare не загружены: ${err.message}`);
  process.exit(1);
}
