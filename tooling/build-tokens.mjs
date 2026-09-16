#!/usr/bin/env node
/**
 * Portfolio — генератор CSS-переменных из tokens.json
 * ───────────────────────────────────────────────────
 * Единый источник истины — tokens.json. Скрипт обходит дерево токенов,
 * раскрывает алиасы {a.b.c} и пишет src/styles/tokens.css:
 *   :root                      — global + тема light
 *   :root[data-theme="dark"]   — ручное переключение
 *   @media (prefers-color-scheme: dark) — системная тема
 *   [data-scheme="light|dark"]  — тема на любом узле (блок-образец в кейсе)
 *
 * Отличие от DS TTS R14: там карта «--переменная → токен» захардкожена в скрипте.
 * Здесь имя переменной берётся из поля description токена (или выводится из пути),
 * поэтому новый токен не требует правок генератора.
 *
 *   node tooling/build-tokens.mjs          # записать
 *   node tooling/build-tokens.mjs --check  # только сверить (CI), ничего не писать
 *
 * Зависимостей нет — только Node.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'styles', 'tokens.css');
const CHECK = process.argv.includes('--check');

const tokens = JSON.parse(readFileSync(join(ROOT, 'tokens.json'), 'utf8'));

/* --- алиасы: {a.b.c} → литеральное значение (ссылка может вести на узел или на его .value) --- */
function resolve(v, depth = 0) {
  if (depth > 10) throw new Error(`Зацикленный алиас: ${v}`);
  if (typeof v !== 'string' || !(v.startsWith('{') && v.endsWith('}'))) return v;
  const path = v.slice(1, -1).split('.');
  let node = tokens;
  for (const p of path) {
    node = node?.[p];
    if (node === undefined) throw new Error(`Алиас не найден: ${v}`);
  }
  return resolve(node?.value ?? node, depth + 1);
}

/* --- имя CSS-переменной: description токена, иначе — из пути --- */
const varName = (token, path) =>
  token.description?.startsWith('--') ? token.description : '--' + path.slice(1).join('-');

/* --- значения по типу: числовые размеры получают px --- */
const PX_TYPES = new Set(['spacing', 'borderRadius', 'sizing', 'fontSizes']);
function format(token) {
  const v = resolve(token.value);
  if (PX_TYPES.has(token.type) && /^-?\d+(\.\d+)?$/.test(String(v))) return `${v}px`;
  return String(v);
}

/* --- обход: собираем [{ name, value, group }] в порядке объявления --- */
function collect(node, path = [], out = [], group = null) {
  for (const [key, val] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (val && typeof val === 'object' && 'value' in val && 'type' in val) {
      out.push({ name: varName(val, [...path, key]), value: format(val), group });
    } else if (val && typeof val === 'object') {
      const next = [...path, key];
      collect(val, next, out, next.slice(1).join('.') || key);
    }
  }
  return out;
}

function render(vars, indent = '  ') {
  const lines = [];
  let seen = null;
  const pad = Math.max(...vars.map((v) => v.name.length)) + 2;
  for (const v of vars) {
    if (v.group !== seen) {
      if (seen !== null) lines.push('');
      lines.push(`${indent}/* ${v.group} */`);
      seen = v.group;
    }
    lines.push(indent + `${v.name}:`.padEnd(pad) + v.value + ';');
  }
  return lines.join('\n');
}

const globals = collect(tokens.global, ['global']);
const themes = {
  dark: collect(tokens.dark, ['dark']),
  light: collect(tokens.light, ['light']),
};

/* Тема по умолчанию объявлена в tokens.json ($meta.defaultTheme) — бренд TBCS тёмный. */
const BASE = tokens.$meta?.defaultTheme === 'light' ? 'light' : 'dark';
const ALT = BASE === 'dark' ? 'light' : 'dark';

const css = `/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   GENERATED FROM tokens.json \u2014 \u041d\u0415 \u0420\u0415\u0414\u0410\u041a\u0422\u0418\u0420\u041e\u0412\u0410\u0422\u042c \u0412\u0420\u0423\u0427\u041d\u0423\u042e
   \u041f\u0435\u0440\u0435\u0441\u0431\u043e\u0440\u043a\u0430: npm run build \u00b7 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430: npm run check
   \u0422\u0435\u043c\u0430 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e: ${BASE}
   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
:root {
  color-scheme: ${BASE} ${ALT};

${render(globals)}

${render(themes[BASE])}
}

/* \u0420\u0443\u0447\u043d\u043e\u0435 \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043d\u0430 \u0430\u043b\u044c\u0442\u0435\u0440\u043d\u0430\u0442\u0438\u0432\u043d\u0443\u044e \u0442\u0435\u043c\u0443 */
:root[data-theme="${ALT}"] {
${render(themes[ALT])}
}

/* \u0421\u0438\u0441\u0442\u0435\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430 (\u043d\u0435 \u043f\u0435\u0440\u0435\u0431\u0438\u0432\u0430\u0435\u0442 \u044f\u0432\u043d\u044b\u0439 \u0432\u044b\u0431\u043e\u0440 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f) */
@media (prefers-color-scheme: ${ALT}) {
  :root:not([data-theme="${BASE}"]) {
${render(themes[ALT], '    ')}
  }
}

/* \u0422\u0435\u043c\u0430 \u043d\u0430 \u043b\u044e\u0431\u043e\u043c \u0443\u0437\u043b\u0435: \u043e\u0434\u0438\u043d \u0431\u043b\u043e\u043a \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b \u043c\u043e\u0436\u0435\u0442 \u0436\u0438\u0442\u044c \u0432 \u0447\u0443\u0436\u043e\u0439 \u0442\u0435\u043c\u0435 */
[data-scheme="${BASE}"] {
${render(themes[BASE])}
}

[data-scheme="${ALT}"] {
${render(themes[ALT])}
}
`;

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error(`✗ ${OUT} не существует — запусти npm run build`);
    process.exit(1);
  }
  const current = readFileSync(OUT, 'utf8');
  if (current !== css) {
    console.error('✗ tokens.css разошёлся с tokens.json — запусти npm run build');
    process.exit(1);
  }
  console.log(`✓ tokens.css соответствует tokens.json (${globals.length + themes[BASE].length} переменных)`);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, css);
  console.log(`✓ tokens.css собран: ${globals.length} global + ${themes[BASE].length} ${BASE} (базовая) + ${themes[ALT].length} ${ALT}`);
}
