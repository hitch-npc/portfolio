/**
 * Крутилка — горизонтальная линейка с делениями. Тянешь пальцем — значение
 * идёт по «круглым» числам, на каждом делении стрелка вздрагивает (на iPhone
 * ещё и лёгкий щелчок вибрацией); отпустил — линейка докатывается по
 * инерции и встаёт точно на деление. Тап по линейке — переезд к тому
 * делению, стрелки клавиатуры — на одно деление.
 *
 * Щелчок: из кода iOS 27 не вибрирует, щёлкает только переключатель
 * <input switch>, когда палец перегоняет его ползунок на другую сторону.
 * Поэтому на линейке лежит прозрачный переключатель: до касания — на всю
 * линейку (палец точно начинает на нём), с первым движением сжимается до
 * родного размера под пальцем и на каждом делении прыгает вбок — палец
 * оказывается то на левой, то на правой его половине, и ползунок
 * перещёлкивает сам. Проверено в лаборатории (режим E, src/views/lab.js).
 *
 * onInput — значение меняется (для подписи рядом), onCommit — линейка
 * остановилась (для записи). Во время движения ничего не перерисовывается.
 */
import { h, calm } from '../ui.js';

const TICK = 10; // px между делениями — как в CSS (.dial-tick)
const JUMP = 0.3; // прыжок переключателя, доля его ширины: палец то на 20 %, то на 80 %

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9];

/** 0…9 по одному, дальше — круглые числа до миллиона. */
export const AMOUNTS = [
  ...Array.from({ length: 10 }, (_, i) => i),
  ...[10, 100, 1000, 10000, 100000].flatMap((d) => NICE.map((m) => Math.round(m * d))),
  1_000_000,
];

/** Шаг кнопок −/+. */
export const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

const nearest = (values, v) =>
  values.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(values[best] - v) ? i : best), 0);
const isMajor = (v) => v > 0 && Number.isInteger(Math.log10(v)); // 1, 10, 100 …
const short = (v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1000 ? `${v / 1000}K` : String(v));

export function dial({ values, value, label, onInput, onCommit = onInput, disabled = false }) {
  const last = values.length - 1;
  let pos = nearest(values, value ?? 0); // дробная позиция под стрелкой
  let idx = pos; // деление под стрелкой
  let raf = 0;
  let off = disabled;
  let ride = null; // палец на переключателе: где линейка, его размер, сторона прыжка

  const track = h('div', { class: 'dial-track', 'aria-hidden': 'true' }, values.map((v) =>
    h('span', { class: ['dial-tick', isMajor(v) && 'is-major'] }, isMajor(v) && h('span', { class: 'dial-num' }, short(v)))));
  const needle = h('span', { class: 'dial-needle', 'aria-hidden': 'true' });
  const sw = h('input', { class: 'dial-switch', type: 'checkbox', switch: true, tabindex: '-1', 'aria-hidden': 'true' });
  // его переключение — только ради щелчка, дальше линейки не идёт
  for (const type of ['click', 'input', 'change']) sw.addEventListener(type, (e) => e.stopPropagation());
  const el = h('div', {
    class: ['dial', disabled && 'is-off'], role: 'slider', tabindex: disabled ? '-1' : '0', 'aria-label': label,
    'aria-valuemin': String(values[0]), 'aria-valuemax': String(values[last]), 'aria-disabled': disabled ? 'true' : null,
  }, track, needle, sw);

  const clamp = (p) => Math.max(0, Math.min(last, p));
  const paint = () => {
    track.style.transform = `translateX(${-pos * TICK}px)`;
    el.setAttribute('aria-valuenow', String(values[idx]));
  };

  /** Переключатель под пальцем; left/top, не transform — рамку WebKit берёт из вёрстки. */
  function rideTo(x, y) {
    if (!ride) return;
    if (!ride.w) {
      el.classList.add('is-riding');
      const r = sw.getBoundingClientRect();
      ride.w = r.width;
      ride.h = r.height;
    }
    sw.style.setProperty('--sx', `${x - ride.left - ride.w / 2 + ride.side * JUMP * ride.w}px`);
    sw.style.setProperty('--sy', `${y - ride.top - ride.h / 2}px`);
  }

  function set(p, felt = false) {
    pos = p;
    const i = Math.round(clamp(p));
    if (i !== idx) {
      idx = i;
      onInput(values[i]);
      if (felt && ride) ride.side = ride.side === 1 ? -1 : 1; // щелчок — на следующем rideTo
      if (!calm()) {
        needle.classList.remove('is-tick');
        void needle.offsetWidth; // перезапуск вздрагивания
        needle.classList.add('is-tick');
      }
    }
    paint();
  }

  /** Докатиться до деления и встать. */
  function glide(target) {
    cancelAnimationFrame(raf);
    const to = Math.round(clamp(target));
    const from = pos;
    if (calm() || from === to) {
      set(to);
      onCommit(values[idx]);
      return;
    }
    const dur = Math.min(700, 240 + Math.abs(to - from) * 35);
    const t0 = performance.now();
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      set(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(frame);
      else {
        raf = 0;
        onCommit(values[idx]);
      }
    };
    raf = requestAnimationFrame(frame);
  }

  el.addEventListener('pointerdown', (e) => {
    if (off || e.button > 0) return;
    e.preventDefault(); // фокус остаётся в поле названия, текст не выделяется
    cancelAnimationFrame(raf);
    const x0 = e.clientX;
    const p0 = pos;
    let prev = { x: x0, t: e.timeStamp };
    let v = 0; // px/мс
    let moved = 0;
    // на переключателе палец и так «прилип» к нему (iOS); чужой захват
    // событий мог бы отнять их у переключателя — как в лаборатории, без него
    if (e.target === sw) {
      const box = el.getBoundingClientRect();
      ride = { left: box.left, top: box.top, side: 0 };
    }
    if (!ride || e.pointerType !== 'touch') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* палец уже отпущен */
      }
    }
    el.classList.add('is-active');
    const move = (ev) => {
      const dx = ev.clientX - x0;
      moved = Math.max(moved, Math.abs(dx));
      const raw = p0 - dx / TICK;
      // за краем — упругость, а не стена
      set(raw < 0 ? raw / 3 : raw > last ? last + (raw - last) / 3 : raw, true);
      rideTo(ev.clientX, ev.clientY);
      const dt = Math.max(1, ev.timeStamp - prev.t);
      v = 0.7 * ((ev.clientX - prev.x) / dt) + 0.3 * v;
      prev = { x: ev.clientX, t: ev.timeStamp };
    };
    const up = (ev) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('is-active', 'is-riding');
      ride = null;
      if (moved < 4 && ev.type === 'pointerup') {
        // тап: к делению под пальцем
        const box = el.getBoundingClientRect();
        glide(pos + (ev.clientX - (box.left + box.width / 2)) / TICK);
        return;
      }
      // бросок: докатывается тем дальше, чем быстрее вели
      const fling = ev.timeStamp - prev.t > 80 ? 0 : Math.max(-160, Math.min(160, v * 140));
      glide(pos - fling / TICK);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });

  el.addEventListener('keydown', (e) => {
    const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (off || (by == null && e.key !== 'Home' && e.key !== 'End')) return;
    e.preventDefault();
    glide(e.key === 'Home' ? 0 : e.key === 'End' ? last : idx + by);
  });

  /** Значение набрали цифрами: линейка встаёт к ближайшему делению, молча. */
  el.setValue = (v) => {
    cancelAnimationFrame(raf);
    pos = idx = nearest(values, v ?? 0);
    paint();
  };

  /** Выключить (штриховка, не тянется) и включить обратно — без пересборки. */
  el.setDisabled = (b) => {
    off = b;
    el.classList.toggle('is-off', b);
    el.tabIndex = b ? -1 : 0;
    b ? el.setAttribute('aria-disabled', 'true') : el.removeAttribute('aria-disabled');
  };

  paint();
  return el;
}
