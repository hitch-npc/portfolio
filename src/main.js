import './styles/fonts.css';
import './styles/fonts-fontshare.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/preloader.css';
import './styles/hero.css';
// после hero.css: .neon-text перебивает цвет .label; до секций: те задают свои --neon-*
import './styles/neon.css';
import './styles/skills.css';
import './styles/work.css';
import './styles/case.css';
import './styles/tts-case.css';
import './styles/overlay.css';
import { GlyphField } from './brand/glyph-field.js';
import { Preloader } from './brand/preloader.js';
import { mountTape } from './brand/vhs.js';
import { SkillsWheel } from './sections/skills.js';
import { mountWork } from './sections/work.js';
import { mountCase } from './sections/case.js';

// Отладочные ручки — только в dev. В сборке import.meta.env.DEV = false,
// и всё, что под ним, вырезается: ни панели, ни window.__* на витрине.
const DEV = import.meta.env.DEV;
const expose = (name, value) => { if (DEV) window[name] = value; };

/** Шрифт должен быть готов до построения маски — иначе знак соберётся из системного. */
async function waitForDisplayFont() {
  if (!document.fonts) return;
  try {
    await document.fonts.load('800 100px Archivo');
    await document.fonts.ready;
  } catch {
    /* шрифт не приехал — маска соберётся из системного гротеска, знак останется читаемым */
  }
}

/** Ставит ™ к правому верхнему углу знака по габаритам, которые отдаёт поле. */
function bindTrademark(canvas, tm) {
  if (!tm) return null;
  canvas.addEventListener('markbox', (e) => {
    const box = e.detail;
    const size = Math.max(11, box.cap * 0.12);
    tm.style.fontSize = `${size}px`;
    tm.style.left = `${box.left + box.width + size * 0.35}px`;
    tm.style.top = `${box.top - size * 0.1}px`;
    tm.style.opacity = '1';
  });
  return tm;
}

/**
 * Прокрутка уводит всё, кроме логотипа и города: знак и нижняя строка гаснут,
 * закреплённая верхняя строка остаётся. Значение отдаём в CSS одной переменной.
 */
function bindHeroFade(hero) {
  const targets = [...document.querySelectorAll('[data-hero-fade]')];
  if (!targets.length) return;

  let ticking = false;
  const apply = () => {
    const span = innerHeight * 0.55;
    const fade = Math.max(0, Math.min(1, 1 - scrollY / span));
    for (const el of targets) el.style.setProperty('--fade', fade.toFixed(3));
    hero.style.visibility = fade <= 0.001 ? 'hidden' : '';
  };

  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; apply(); });
  }, { passive: true });

  apply();
}

/** Пока hero вне экрана, поле не рисуется: незачем жечь кадры. */
function bindVisibility(hero, fields) {
  const io = new IntersectionObserver(([entry]) => {
    for (const f of fields) f.paused = !entry.isIntersecting;
  }, { rootMargin: '10% 0px' });
  io.observe(hero);
}

/**
 * Плёнка живёт только вне кейса. Пока окно кейса открыто, она гасится и ставится
 * на паузу: экраны продукта должны читаться без помех, а кадры незачем жечь.
 * Кейс закрыт — плёнка снова идёт.
 */
function bindTapeMute(tape) {
  const vhs = document.querySelector('.vhs');
  const caseEl = document.querySelector('.case');
  if (!vhs || !caseEl) return () => {};

  const mute = (on) => {
    vhs.classList.toggle('is-mute', on);
    if (tape) tape.paused = on;
  };

  // кейс живёт в <dialog>: закрытое окно не отрисовано и не пересекает экран.
  // Порог ровно 0 — кейс выше экрана в разы, заметной доли не наберёт
  new IntersectionObserver(([e]) => mute(e.isIntersecting), { threshold: 0 }).observe(caseEl);
  return mute;
}

async function boot() {
  const tape = mountTape(document.querySelector('[data-vhs-tape]'));

  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('[data-glyph-field]');
  if (!canvas || !hero) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const preRoot = document.querySelector('[data-preloader]');
  const tm = bindTrademark(canvas, document.querySelector('[data-mark-tm]'));

  const startField = () => {
    const field = new GlyphField(canvas);
    if (tm) field.attachSatellite(tm);
    field.resize();
    field.start();
    expose('__field', field);

    bindVisibility(hero, [field]);
    bindHeroFade(hero);
  };

  if (reduced || !preRoot) {
    preRoot?.remove();
    await waitForDisplayFont();
    startField();
  } else {
    const pre = new Preloader(preRoot);
    const done = pre.run();
    await waitForDisplayFont();
    await done;
    startField();
    await pre.dismiss();
  }

  const skillsSection = document.querySelector('[data-skills]');
  if (skillsSection) {
    const skills = new SkillsWheel(skillsSection);
    expose('__skills', skills);
    // зрачок не крутится, пока блок за экраном
    bindVisibility(skillsSection, [skills.iris]);
  }

  const muteTape = bindTapeMute(tape);
  expose('__muteTape', muteTape);
  mountCase(document.querySelector('[data-tts]'));
  expose('__work', mountWork(document.querySelector('[data-work]')));

  // панель настройки параметров знака: dev-сервер и ?tune в адресе.
  // Динамический импорт под DEV — модуль панели в сборку не попадает вовсе
  if (DEV && new URLSearchParams(location.search).has('tune')) {
    const { mountTunePanel } = await import('./brand/tune.js');
    mountTunePanel(window.__field);
  }
}

boot();
