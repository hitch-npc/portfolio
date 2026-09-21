#!/usr/bin/env node
/**
 * Portfolio — проверка ссылок сборки
 * ──────────────────────────────────
 * Сборка встраивает в index.html почти всё, но не всё: постеры архива
 * остаются файлами, шрифты и снимки лежат в public. Значит у витрины есть
 * ссылки наружу, и они могут разъехаться с тем, что реально попало в dist.
 *
 * Так уже было: постеры уехали в dist/posters, а ссылка на них собралась
 * от места скрипта, которого после встраивания не существует, — все одиннадцать
 * отдали 404 на живом сайте. Локально этого не видно: dev-сервер отдаёт
 * исходники и о сборке не знает.
 *
 * Поэтому здесь берутся все адреса из собранной страницы и проверяется,
 * что каждому соответствует файл в dist. Гоняется в конце npm run build.
 *
 *   node tooling/links.mjs
 *
 * Зависимостей нет — только Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
// и из разметки: src="./…", href="./…"
for (const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) refs.add(m[1]);
// и из стилей: url(./…)
for (const m of html.matchAll(/url\(["']?\.\/([^"')]+)["']?\)/g)) refs.add(m[1]);

const broken = [...refs]
  .filter((r) => !/^(https?:|data:|#)/.test(r))
  .filter((r) => !existsSync(join(DIST, r.replace(/^\.\//, '').split('?')[0])))
  .sort();

for (const r of broken) console.log(`  ✗ ссылка ведёт в никуда: ${r}`);
console.log(broken.length
  ? `\n✗ Битых ссылок: ${broken.length}.`
  : `\n✓ Ссылки сборки целы (${refs.size}).`);
process.exit(broken.length ? 1 : 0);
