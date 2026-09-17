#!/usr/bin/env node
/**
 * Portfolio — страж правил
 * ────────────────────────
 * Превращает правила системы в автопроверку. Гоняется в npm run check и в CI.
 *
 * Правила (все — ОШИБКИ, сознательно строже DS TTS R14, где сырой hex
 * оставался предупреждением и в итоге накопился в ядре):
 *   1. сырой #hex вне :root — цвета только через var(--…);
 *      это касается и JS: canvas-фигуры читают цвет через getComputedStyle;
 *   2. border-radius только из токенов --r-* — формы iOS 26: капсулы и
 *      концентрические углы держатся на шкале, сырые px её размывают;
 *   3. transition/animation в файле без блока @media (prefers-reduced-motion: reduce);
 *   4. outline:none / outline:0 без правила :focus-visible в том же файле.
 *
 * Сгенерированные файлы (tokens.css) не проверяются — они и есть источник значений.
 *
 *   node tooling/guardrail.mjs
 *
 * Зависимостей нет — только Node.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'public', 'vendor']);
const GENERATED = new Set(['src/styles/tokens.css', 'src/styles/tts-case.css']);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (['.css', '.js', '.mjs', '.html'].includes(extname(entry))) acc.push(full);
  }
  return acc;
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
let errors = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (GENERATED.has(rel) || rel.startsWith('tooling/')) continue;

  const src = readFileSync(file, 'utf8');
  const msgs = [];

  /* 1) сырой #hex вне :root */
  const rootBlocks = [...src.matchAll(/:root[^{]*\{[^}]*\}/g)].map((m) => [m.index, m.index + m[0].length]);
  const inRoot = (i) => rootBlocks.some(([a, b]) => i >= a && i < b);
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (inRoot(m.index)) continue;
    errors++;
    msgs.push(`  ✗ стр.${lineOf(src, m.index)}  сырой ${m[0]} — используй var(--…)`);
  }

  /* 2) border-radius только из токенов (ноль и проценты допустимы) */
  for (const m of src.matchAll(/border-radius:\s*([^;]+);/g)) {
    const bad = [...m[1].matchAll(/(\d*\.?\d+)px/g)].find((x) => +x[1] > 0);
    if (bad) {
      errors++;
      msgs.push(`  ✗ стр.${lineOf(src, m.index)}  border-radius ${bad[0]} — только var(--r-…)`);
    }
  }

  if (extname(file) === '.css') {
    /* 3) движение без reduced-motion */
    const moves = /(^|[\s;{])(transition|animation)\s*:/m.test(src);
    if (moves && !/prefers-reduced-motion\s*:\s*reduce/.test(src)) {
      errors++;
      msgs.push('  ✗ файл двигает интерфейс, но не содержит @media (prefers-reduced-motion: reduce)');
    }

    /* 4) снятый outline без focus-visible */
    const killsOutline = /outline:\s*(none|0)\b/.test(src);
    if (killsOutline && !/:focus-visible/.test(src)) {
      errors++;
      msgs.push('  ✗ outline снят, но :focus-visible в файле не описан');
    }
  }

  if (msgs.length) {
    console.log(`\n[${rel}]`);
    console.log(msgs.join('\n'));
  }
}

console.log(errors ? `\n✗ Страж не пройден: ошибок ${errors}.` : '\n✓ Страж пройден.');
process.exit(errors ? 1 : 0);
