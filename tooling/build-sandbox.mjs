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

const html = readFileSync(SRC, 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';

// charset и viewport ставит сам хост; заголовок в галерее песочницы — имя, а не описание
const headKept = head
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>TBCS Arrow Field</title>')
  .replace(/<meta\s+charset=[^>]*>/gi, '')
  .replace(/<meta\s+name=["']viewport["'][^>]*>/gi, '')
  .trim();

const themePin = `<script>document.documentElement.setAttribute('data-theme','dark');</script>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${headKept}\n${themePin}\n${body.trim()}\n`);

const kb = (Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(1);
console.log(`✓ dist/sandbox.html собран (${kb} КБ)`);
