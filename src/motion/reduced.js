/**
 * Одна проверка prefers-reduced-motion на весь сайт.
 *
 * Функция, а не константа: настройку можно переключить, не перезагружая
 * страницу, и каждый эффект спрашивает её в момент запуска.
 */
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
