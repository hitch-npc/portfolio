/**
 * Пауза холстов за экраном: блок ушёл из кадра — его холсты не рисуются.
 *
 * Цели — любые объекты с полем paused (поле знака, зрачок): им не нужно
 * знать про IntersectionObserver, они просто пропускают кадр.
 */
export function pauseOffscreen(el, targets) {
  const io = new IntersectionObserver(([entry]) => {
    for (const t of targets) t.paused = !entry.isIntersecting;
  }, { rootMargin: '10% 0px' });
  io.observe(el);
  return () => io.disconnect();
}
