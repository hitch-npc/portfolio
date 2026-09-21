#!/usr/bin/env node
/**
 * Portfolio — проверка ссылок сборки
 * ──────────────────────────────────
 * Сборка встраивает в index.html почти всё, но не всё: постеры архива
 * остаются файлами, шрифты и снимки лежат в public. Значит у витрины есть
 * ссылки наружу, и они могут разъехаться с тем, что реально попало в dist.
 *
 * Так уже было дважды, и оба раза одинаково: сборщик считает адрес от места
 * файла, который на него ссылается, а singlefile этот файл потом вынимает и
 * вставляет в index.html в корне. Сначала так потеряли папку постеры, потом
 * ушли уровнем выше сайта шрифты — и то и другое отдавало 404 на живом
 * сайте. Локально этого не видно: dev-сервер отдаёт исходники и о сборке
 * не знает.
 *
 * Поэтому здесь берутся все адреса из собранной страницы и проверяется, что
 * каждому соответствует файл внутри dist. Отдельно ловятся два случая: путь,
 * уходящий выше dist (../), и путь от корня домена (/…) — на GitHub Pages
 * сайт лежит в подпапке, и корень домена ему не принадлежит.
 *
 * Гоняется в конце npm run build.
 *
 *   node tooling/links.mjs
 *
 * Зависимостей нет — только Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PAGE = join(DIST, 'index.html');

if (!existsSync(PAGE)) {
  console.log('✗ dist/index.html не собран — проверять нечего.');
  process.exit(1);
}

const html = readFileSync(PAGE, 'utf8');
const refs = new Set();

// адреса ресурсов из скрипта: new URL(`posters/…`, import.meta.url)
for (const m of html.matchAll(/new URL\(`([^`]+)`/g)) refs.add(m[1]);
// из разметки
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) refs.add(m[1]);
// и из стилей
for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.add(m[1]);

/** Наружу — всё, что не наш файл: сеть, данные, якоря.
    %23 — это закодированная решётка: так выглядят ссылки на градиенты
    внутри встроенных SVG, к файлам они отношения не имеют. */
const outside = (r) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?|%23)/i.test(r);

const bad = [];
for (const raw of [...refs].sort()) {
  if (!raw || outside(raw)) continue;
  const path = raw.split(/[?#]/)[0];
  if (!path) continue;

  if (isAbsolute(path)) {
    bad.push([raw, 'адрес от корня домена — сайт на Pages лежит в подпапке']);
    continue;
  }
  const full = resolve(DIST, path);
  const inside = relative(DIST, full);
  if (inside.startsWith('..')) {
    bad.push([raw, 'путь уходит выше dist — после встраивания это мимо сайта']);
    continue;
  }
  if (!existsSync(full)) bad.push([raw, 'файла нет в dist']);
}

for (const [r, why] of bad) console.log(`  ✗ ${r} — ${why}`);
console.log(bad.length
  ? `\n✗ Битых ссылок: ${bad.length}.`
  : `\n✓ Ссылки сборки целы (${refs.size}).`);
process.exit(bad.length ? 1 : 0);
