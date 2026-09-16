#!/usr/bin/env node
/**
 * Портфолио — сборка ядра кейса TTS
 * ─────────────────────────────────
 * Кейс TTS показывается своим дизайном, а не пересказом: сюда переносится
 * настоящий CSS из DS TTS R14 (vendor/tts) — токены обеих тем, несколько
 * классов ядра и стили демонстраций со страницы кейса.
 *
 * Чужие стили нельзя пускать в глобальную область: портфолио живёт на своих
 * токенах. Поэтому все селекторы уводятся под .tts, :root и body становятся
 * самим .tts, а светлая тема — .tts[data-tts-theme="light"].
 *
 * Файл на выходе — сгенерированный: страж его не проверяет, править руками
 * нечего, источник лежит в vendor/tts.
 *
 *   node tooling/build-tts.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'vendor', 'tts');
const OUT = join(ROOT, 'src', 'styles', 'tts-case.css');

const read = (name) => readFileSync(join(SRC, name), 'utf8');

const SCOPE = '.tts';

/** Селектор внутри кейса: :root и body — это сам контейнер, остальное под ним. */
function scopeSelector(sel) {
  return sel
    .split(',')
    .map((part) => {
      const s = part.trim();
      if (!s) return s;
      if (s === ':root' || s === 'html' || s === 'body') return SCOPE;
      if (s.startsWith(':root')) return SCOPE + s.slice(5);
      return `${SCOPE} ${s}`;
    })
    .join(', ');
}

/** Комментарии убираем до разбора: иначе они прилипают к селектору и рушат его. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Проходит по верхнему уровню и уводит правила под .tts.
 * @keyframes и @font-face не трогаем: внутри у них не селекторы, а кадры.
 */
function scopeCss(css) {
  let out = '';
  let i = 0;

  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) { out += css.slice(i); break; }

    const head = css.slice(i, open).trim();
    const end = matchBrace(css, open);
    const body = css.slice(open + 1, end);

    if (head.startsWith('@keyframes') || head.startsWith('@font-face')) {
      out += `${head} {${body}}\n`;
    } else if (head.startsWith('@')) {
      out += `${head} {\n${scopeCss(body)}}\n`;
    } else {
      out += `${scopeSelector(head)} {${body}}\n`;
    }

    i = end + 1;
  }

  return out;
}

/** Ищет парную закрывающую скобку. */
function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length;
}

const dark = read('tokens-dark.css').replace(/:root/, SCOPE);
const light = read('tokens-light.css').replace(/:root/, `${SCOPE}[data-tts-theme="light"]`);

const css = `/* ──────────────────────────────────────────────────────────────────
   GENERATED — НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ
   Источник: vendor/tts (DS TTS R14, 14.7.1) · сборка: node tooling/build-tts.mjs
   Все правила уведены под .tts — портфолио остаётся на своих токенах.
   ────────────────────────────────────────────────────────────────── */

${dark}

${light}

${scopeCss(strip(read('core-bits.css')))}
${scopeCss(strip(read('case.css')))}`;

writeFileSync(OUT, css);
console.log(`✓ tts-case.css собран: ${(css.length / 1024).toFixed(1)} КБ`);
