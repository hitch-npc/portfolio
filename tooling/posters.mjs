#!/usr/bin/env node
/**
 * Готовит постеры для кольца.
 *
 * Кольцо показывает карточку шириной ~180 css-пикселей даже на полном
 * приближении, то есть ~360 физических на ретине. Исходный постер в 2000 px
 * впятеро больше нужного: это мегабайты трафика и лишний декод на слабых
 * машинах ради пикселей, которых не видно. Поэтому здесь исходники не
 * правятся, а рядом кладётся веб-копия.
 *
 *   npm run posters                                    что уже лежит
 *   npm run posters -- ~/Desktop/poster.jpg            обложка, имя из файла
 *   npm run posters -- ~/Desktop/p.jpg=nature-ceramics обложка, своё имя
 *   npm run posters -- --into hamlet ~/Desktop/*.jpg   материалы проекта
 *
 * Обложка — карточка в кольце, её порядок задаёт номер в имени: 01, 02, 03…
 * Чтобы переставить постеры местами, достаточно переименовать.
 *
 * Материалы проекта (--into) ложатся в папку с именем постера и открываются
 * поп-апом из его разворота. Их смотрят во весь экран, поэтому длинная
 * сторона больше — 1600 px. Гифки и видео копируются как есть: их нельзя
 * прогнать через sips, не потеряв движение.
 *
 * Заодно в meta.json заводится пустая запись под тексты — заголовок, теги,
 * год, клиента, описание. Заполнять не обязательно: без записи разворот
 * возьмёт заголовок из имени файла.
 *
 * Масштабирует sips — он есть в macOS из коробки, зависимостей не нужно.
 * На других системах скрипт честно об этом скажет: скопирует как есть
 * и предупредит, что размер не тронут. sips читает webp и heic, но
 * записывать их не умеет, поэтому такие постеры переводятся в jpeg.
 * Для png формат сохраняется: в нём может быть прозрачность.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'posters');
const META = join(OUT, 'meta.json');
const COVER_MAX = 800;    // длинная сторона обложки, px
const INSIDE_MAX = 1600;  // длинная сторона материала проекта: его смотрят крупно
const QUALITY = 'high';   // ступень качества sips
// форматы, которые sips умеет записывать; остальное уводим в jpeg
const KEEP = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff']);
// движение sips не переживёт — копируем как есть
const PASS = new Set(['.gif', '.mp4', '.webm']);

const IMAGE = /\.(jpe?g|png|webp|avif|tiff?)$/i;

const slug = (name) => name
  .toLowerCase()
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'poster';

const titleOf = (s) => s.replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const canResize = process.platform === 'darwin';

/** Сколько материалов лежит в папке постера. Папки может и не быть. */
const inside_ = (name) => {
  try {
    return readdirSync(join(OUT, name), { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.')).length;
  } catch { return 0; }
};

const covers = () => readdirSync(OUT, { withFileTypes: true })
  .filter((e) => e.isFile() && IMAGE.test(e.name))
  .map((e) => e.name)
  .sort();

/** Кладёт одну копию. Возвращает подпись для отчёта или null, если не вышло. */
function place(src, dest, max) {
  const srcExt = extname(src).toLowerCase() || '.jpg';
  const destExt = extname(dest).toLowerCase();

  if (PASS.has(destExt) || !canResize) {
    copyFileSync(src, dest);
    const kb = (statSync(dest).size / 1024).toFixed(0);
    return canResize
      ? `${kb} КБ, как есть: ${destExt.slice(1)} переживает только копирование`
      : `${kb} КБ, скопирован как есть: sips есть только в macOS`;
  }

  try {
    if (destExt === srcExt) {
      copyFileSync(src, dest);
      execFileSync('sips', ['-Z', String(max), '-s', 'formatOptions', QUALITY, dest], { stdio: 'ignore' });
    } else {
      // перекодировка сразу в нужный формат, мимо промежуточной копии
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', QUALITY,
        '-Z', String(max), src, '--out', dest], { stdio: 'ignore' });
    }
  } catch {
    // за собой убираем: недоделанная копия попала бы в кольцо битой
    rmSync(dest, { force: true });
    return null;
  }

  const kb = (statSync(dest).size / 1024).toFixed(0);
  const note = destExt === srcExt ? '' : ` (из ${srcExt.slice(1)})`;
  return `${max} px по длинной стороне, ${kb} КБ${note}`;
}

/** Имя копии: формат меняем только там, где sips иначе не справится. */
function destExtFor(src) {
  const ext = extname(src).toLowerCase() || '.jpg';
  if (PASS.has(ext)) return ext;
  return KEEP.has(ext) ? ext : '.jpg';
}

/**
 * meta.json в читаемом виде: отступ в два пробела, но короткие списки
 * (теги) остаются в строку — их правят руками, и три строки на один тег
 * мешают больше, чем помогают.
 */
const pretty = (meta) => `${JSON.stringify(meta, null, 2)
  .replace(/\[\n[^[\]{}]*?\n\s*\]/g, (list) => list.replace(/\s+/g, ' ').replace(/\[ /, '[').replace(/ \]/, ']'))}\n`;

/** Заводит пустую запись в meta.json, если её там ещё нет. */
function seedMeta(name) {
  let meta = {};
  try { meta = JSON.parse(readFileSync(META, 'utf8')); } catch { /* файла нет — заведём */ }
  if (meta[name]) return false;
  meta[name] = { title: titleOf(name), kind: ['Poster'] };
  writeFileSync(META, pretty(meta));
  return true;
}

/* ─── что уже лежит ─────────────────────────────────────────────── */

const args = process.argv.slice(2);
if (!args.length) {
  const have = covers();
  let meta = {};
  try { meta = JSON.parse(readFileSync(META, 'utf8')); } catch { /* ещё не заводили */ }

  if (!have.length) console.log('Постеров пока нет.');
  else {
    console.log(`В кольце ${have.length} постеров:`);
    for (const file of have) {
      const name = file.replace(/^\d+[-_]/, '').replace(/\.[^.]+$/, '');
      const inside = inside_(name);
      const texts = meta[name] && (meta[name].note || meta[name].year || meta[name].client);
      console.log(`  ${file}`
        + (inside ? `  +${inside} внутри` : '')
        + (texts ? '' : '  · тексты не заполнены'));
    }
  }
  console.log('\nДобавить обложку:   npm run posters -- <файл> [<файл>=<имя>]');
  console.log('Добавить материалы: npm run posters -- --into <имя> <файл>…');
  console.log(`Тексты:             ${META.replace(ROOT + '/', '')}`);
  process.exit(0);
}

/* ─── материалы проекта ─────────────────────────────────────────── */

if (args[0] === '--into') {
  const name = args[1];
  const files = args.slice(2);
  if (!name || !files.length) {
    console.log('Нужно: npm run posters -- --into <имя-постера> <файл>…');
    process.exit(1);
  }
  if (!covers().some((f) => f.replace(/^\d+[-_]/, '').replace(/\.[^.]+$/, '') === name)) {
    console.log(`✗ обложки «${name}» в кольце нет — сверься с npm run posters`);
    process.exit(1);
  }

  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  let i = Math.max(0, ...readdirSync(dir).map((f) => Number(f.slice(0, 2))).filter(Number.isFinite)) + 1;

  for (const src of files) {
    if (!statSync(src, { throwIfNoEntry: false })?.isFile()) {
      console.log(`✗ нет файла: ${src}`);
      continue;
    }
    const file = `${String(i).padStart(2, '0')}${destExtFor(src)}`;
    const note = place(src, join(dir, file), INSIDE_MAX);
    if (!note) { console.log(`✗ ${basename(src)} — sips не справился, файл пропущен`); continue; }
    console.log(`✓ ${name}/${file} — ${note}`);
    i += 1;
  }
  process.exit(0);
}

/* ─── обложки ───────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
let i = Math.max(0, ...covers().map((f) => Number(f.slice(0, 2))).filter(Number.isFinite)) + 1;

for (const arg of args) {
  const [src, custom] = arg.split('=');
  if (!statSync(src, { throwIfNoEntry: false })?.isFile()) {
    console.log(`✗ нет файла: ${src}`);
    continue;
  }
  const name = slug(custom || basename(src));
  const file = `${String(i).padStart(2, '0')}-${name}${destExtFor(src)}`;
  const note = place(src, join(OUT, file), COVER_MAX);
  if (!note) { console.log(`✗ ${basename(src)} — sips не справился с этим форматом, постер пропущен`); continue; }

  const fresh = seedMeta(name);
  console.log(`✓ ${file} — ${note}${fresh ? ' · запись в meta.json заведена' : ''}`);
  i += 1;
}
