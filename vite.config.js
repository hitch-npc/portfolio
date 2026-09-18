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
 * Сборка в один файл: dist/index.html содержит всё, включая стили и скрипты.
 * Нужна для песочницы — такую страницу можно открыть где угодно, без сервера.
 * На GitHub Pages поедет та же сборка.
 */
export default defineConfig({
  base: './',
  // csp идёт после singlefile: хэш считается от уже встроенного скрипта
  plugins: [viteSingleFile(), csp()],
  build: {
    // вход перечислен явно: в корне лежит ещё gallery.html — песочница кольца,
    // она живёт только на dev-сервере и на витрину попасть не должна
    rollupOptions: { input: 'index.html' },
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
