#!/usr/bin/env node
/**
 * Трекер — сборка
 * ───────────────
 * Трекер живёт рядом с портфолио, в dist/tracker/, и сборщика ему не нужно:
 * модули и CSS браузер берёт как есть. Здесь три дела:
 *
 *   1. скопировать tracker/ в dist/tracker/ (тесты и README — нет);
 *   2. вписать в service worker версию и список файлов для офлайна.
 *      Версия — хэш содержимого: поменялся любой файл → новый кэш
 *      у всех установок, не поменялось ничего → кэш тот же;
 *   3. не пустить на сайт данные. Личные данные (задачи, импорт, экспорт,
 *      бюджет) в репозитории не живут никогда; если JSON всё же оказался
 *      в tracker/, сборка падает, а не публикует его.
 *
 * Гоняется в конце npm run build, после vite (vite чистит dist).
 *
 *   node tooling/build-tracker.mjs
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tracker');
const OUT = join(ROOT, 'dist', 'tracker');
const SKIP = new Set(['test', 'README.md']);
// что может лежать в приложении; всё прочее — повод остановиться и посмотреть
const ALLOWED = new Set(['.html', '.css', '.js', '.webmanifest', '.woff2', '.png', '.txt']);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(relative(SRC, full).split('\\').join('/'));
  }
  return acc;
}

const files = walk(SRC);

const stray = files.filter((f) => !ALLOWED.has(extname(f)));
if (stray.length) {
  console.error('✗ В tracker/ лежит то, чему там не место (данные не публикуются):');
  for (const f of stray) console.error(`  ${f}`);
  process.exit(1);
}

const hash = createHash('sha256');
for (const f of files) hash.update(f).update('\0').update(readFileSync(join(SRC, f))).update('\0');
const version = hash.digest('hex').slice(0, 10);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of files) cpSync(join(SRC, f), join(OUT, f));

/** Заменяет ровно одну строку-заглушку; не нашлась — сборка падает, а не публикует пустой кэш. */
function stamp(file, from, to) {
  const path = join(OUT, file);
  const src = readFileSync(path, 'utf8');
  if (src.split(from).length !== 2) {
    console.error(`✗ ${file}: не найдена заглушка «${from}»`);
    process.exit(1);
  }
  writeFileSync(path, src.replace(from, to));
}

const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.txt'));
stamp('sw.js', "const VERSION = 'dev';", `const VERSION = '${version}';`);
stamp('sw.js', 'const FILES = [];', `const FILES = ${JSON.stringify(precache)};`);
stamp('src/version.js', "export const VERSION = 'dev';", `export const VERSION = '${version}';`);

// каждая ссылка из index.html и fonts.css должна вести в файл сборки
const refs = [];
const html = readFileSync(join(OUT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) refs.push(m[1]);
const fontsCss = readFileSync(join(OUT, 'fonts', 'fonts.css'), 'utf8');
for (const m of fontsCss.matchAll(/url\('([^']+)'\)/g)) refs.push(`fonts/${m[1]}`);
const broken = refs.filter((r) => !existsSync(join(OUT, r)));
if (broken.length) {
  for (const r of broken) console.error(`  ✗ ${r} — файла нет в dist/tracker`);
  process.exit(1);
}

console.log(`✓ Трекер: ${files.length} файлов → dist/tracker, версия ${version}, офлайн-кэш ${precache.length}`);
