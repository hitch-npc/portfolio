/**
 * Кейс TTS: показ переносится как есть, вместе со своими демонстрациями.
 *
 * Разметка и стили — из DS TTS R14 (vendor/tts), здесь только то, что их
 * оживляет: блоки появляются при входе в экран, цифры досчитываются, а классы
 * .is-live включают анимации демонстраций — и гаснут, когда секция ушла.
 * Демонстрации крутятся бесконечно, поэтому вне экрана их незачем держать.
 *
 * prefers-reduced-motion: всё показано сразу, цифры конечные, .is-live не
 * ставится — в самом ядре кейса анимации под этим запросом и так отключены.
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Досчитывает число до конечного за фиксированное время. */
function countTo(el, value, duration = 900) {
  if (reduced()) { el.textContent = String(value); return; }
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(value * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function mountCase(root) {
  if (!root) return null;

  // появление блока: один раз, обратная прокрутка ничего не переигрывает
  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      for (const n of e.target.querySelectorAll('[data-count]')) {
        countTo(n, Number(n.dataset.count));
      }
      reveal.unobserve(e.target);
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });

  for (const el of root.querySelectorAll('.rv')) reveal.observe(el);

  // демонстрации: цикл идёт только пока секция на экране
  if (!reduced()) {
    const live = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.classList.toggle('is-live', e.isIntersecting);
    }, { rootMargin: '10% 0px' });

    for (const sec of root.querySelectorAll('.cs-sec')) live.observe(sec);
  }

  return reveal;
}
