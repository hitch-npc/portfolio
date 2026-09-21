import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Content-Security-Policy для витрины. GitHub Pages заголовков не даёт,
 * поэтому политика едет мета-тегом первой строкой <head>.
 *
 * Скрипт в сборке встроенный, 'unsafe-inline' для него — дыра, поэтому
 * разрешаем ровно то, что собрали: sha256 каждого <script> после инлайна.
 * Любой внедрённый скрипт не совпадёт по хэшу и не выполнится. Стили
 * встроенные и в атрибутах — им 'unsafe-inline', исполняемого в них нет.
 * Сетевых запросов у страницы нет: шрифты лежат рядом, Google не участвует.
 *
 * Только для сборки: dev-сервер Vite сам вставляет скрипты и держит сокет.
 */
function csp() {
  return {
    name: 'portfolio:csp',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue;
        const html = String(file.source);

        const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
          .map(([, body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);

        const policy = [
          "default-src 'none'",
          `script-src ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data:",
          "base-uri 'none'",
          "form-action 'none'",
          "object-src 'none'",
        ].join('; ');

        const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
        file.source = html.replace(/<meta charset=[^>]*>/i, (m) => `${m}\n    ${meta}`);
      }
    },
  };
}

/**
 * Постеры архива остаются файлами.
 *
 * vite-plugin-singlefile велит встраивать вообще всё — в этом и смысл одного
 * файла. Но архив весит больше мегабайта и лежит в самом низу страницы:
 * в base64 он встал бы в первые байты документа и задержал бы первый экран
 * ради картинок, до которых ещё надо долистать. И loading="lazy" на встроенной
 * картинке не значит ничего — байты уже приехали. Поэтому для постеров, и
 * только для них, встраивание снимается.
 *
 * Хук config тут идёт после singlefile: оба плагина в группе post, а внутри
 * группы порядок — порядок списка. Путь приходит исходный, абсолютный.
 *
 * Куда класть постеры — вопрос тонкий, и на нём уже дважды обожглись.
 * Сборщик считает адрес ресурса от того места, где лежит ссылающийся на него
 * файл, а singlefile потом вынимает и скрипт, и стили и вставляет их в
 * index.html в корне. Значит и скрипт, и стили обязаны считаться лежащими
 * в корне, иначе путь уезжает: assetsDir: 'posters' увёл туда скрипт, и
 * постеры потеряли папку (404); assetFileNames на все ресурсы увёл туда же
 * стили, и уже шрифты стали искаться уровнем выше сайта (тоже 404).
 *
 * Поэтому имя задаётся функцией: в папку уходят только сами постеры, всё
 * остальное остаётся в корне.
 */
const POSTER_SRC = /[\\/]src[\\/]posters[\\/]/;

function keepPosters() {
  return {
    name: 'portfolio:keep-posters',
    apply: 'build',
    enforce: 'post',
    config(config) {
      const out = config.build.rollupOptions.output;
      out.entryFileNames = '[name]-[hash].js';
      out.assetFileNames = (info) => {
        const from = info.originalFileNames?.[0] ?? info.names?.[0] ?? info.name ?? '';
        return POSTER_SRC.test(`/${from}`) ? 'posters/[name]-[hash][extname]' : '[name]-[hash][extname]';
      };
      // true — встроить, false — оставить файлом
      config.build.assetsInlineLimit = (file) => !POSTER_SRC.test(file);
    },
  };
}

/**
 * Сборка в один файл: dist/index.html содержит всё, включая стили и скрипты.
 * Рядом лежат только шрифты и постеры архива — их встраивать дороже, чем
 * отдать файлами. Страница открывается и с диска, и с GitHub Pages: base
 * относительный.
 */
export default defineConfig({
  base: './',
  // csp идёт после singlefile: хэш считается от уже встроенного скрипта
  plugins: [viteSingleFile(), csp(), keepPosters()],
  build: {
    // вход перечислен явно: в корне лежат ещё песочницы — gallery.html (кольцо)
    // и field.html (знак). Они живут только на dev-сервере и на витрину не попадают
    rollupOptions: { input: 'index.html' },
    target: 'es2020',
    cssCodeSplit: false,
  },
});
