/*
 * Оформление до первой отрисовки. Настройки живут в IndexedDB и приходят
 * позже первого кадра — без этого тёмная тема при запуске мигала бы светлой.
 * Здесь — копия из localStorage (её пишет main.js); правда всё равно в базе.
 * Обычный скрипт, не модуль: выполняется сразу, после стилей.
 */
try {
  const look = JSON.parse(localStorage.getItem('tracker-look') || 'null');
  if (look) {
    const root = document.documentElement;
    root.dataset.theme = look.theme;
    root.dataset.palette = look.palette;
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }
} catch {
  // нет доступа к localStorage — тема придёт из базы на первом кадре приложения
}
