import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Сборка в один файл: dist/index.html содержит всё, включая стили и скрипты.
 * Нужна для песочницы — такую страницу можно открыть где угодно, без сервера.
 * На GitHub Pages поедет та же сборка.
 */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
