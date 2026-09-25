/**
 * Service worker трекера: приложение целиком лежит в кэше и открывается без сети.
 *
 * VERSION и FILES вписывает сборка (tooling/build-tracker.mjs): версия — хэш
 * содержимого, так что любая правка даёт новый кэш. Новая версия встаёт сразу
 * и начинает отвечать со следующего открытия; открытый экран не перезагружается —
 * набранное не пропадёт.
 */
const VERSION = 'dev';
const FILES = [];
const CACHE = `tracker-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // мимо HTTP-кэша: GitHub Pages разрешает держать файл 10 минут, и новая
      // версия могла лечь в кэш со старыми файлами
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // любая навигация внутри приложения — это index.html, адрес экрана живёт в #
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((hit) => hit ?? fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? fetch(req)));
});
