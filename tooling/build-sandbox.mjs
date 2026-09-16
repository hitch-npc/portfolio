#!/usr/bin/env node
/**
 * Готовит однофайловую сборку к публикации песочницей.
 *
 * Хост песочницы сам оборачивает страницу в <!doctype html>…<head>…<body>,
 * поэтому свои обёртки надо снять, оставив заголовок, стили, разметку и скрипт.
 * Плюс закрепляем тёмную тему: блок бренда чёрный по определению, и светлая
 * тема зрителя не должна его перекрашивать.
 *
 *   npm run build:sandbox   (после npm run build)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'dist', 'index.html');
const OUT = join(ROOT, 'dist', 'sandbox.html');

// шрифты витрины лежат файлами рядом, а песочница — один файл:
// OFL-шрифты встраиваем data-URI, предзагрузку снимаем. Gambarino и Switzer
// (ITF FFL) не встраиваем: лицензия не разрешает копию, которую можно извлечь.
// Их @font-face убираем — песочница покажет запасные гарнитуры
const html = readFileSync(SRC, 'utf8')
  .replace(/<link\s+rel=["']preload["'][^>]*as=["']font["'][^>]*>\s*/gi, '')
  .replace(/@font-face\s*\{[^}]*fonts\/fontshare\/[^}]*\}/g, '')
  .replace(/url\((['"]?)\.\/fonts\/([\w.-]+\.woff2)\1\)/g, (_, _q, name) => {
    const b64 = readFileSync(join(ROOT, 'dist', 'fonts', name)).toString('base64');
    return `url(data:font/woff2;base64,${b64})`;
  });

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';

// charset и viewport ставит сам хост; заголовок в галерее песочницы — имя, а не описание.
// CSP витрины снимаем: у песочницы своя политика, а скрипт темы ниже не прошёл бы по хэшу
const headKept = head
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>TBCS Arrow Field</title>')
  .replace(/<meta\s+charset=[^>]*>/gi, '')
  .replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
  .replace(/<meta\s+name=["']viewport["'][^>]*>/gi, '')
  .trim();

const themePin = `<script>document.documentElement.setAttribute('data-theme','dark');</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${headKept}\n${themePin}\n${body.trim()}\n`);

const kb = (Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(1);
console.log(`✓ dist/sandbox.html собран (${kb} КБ)`);
