import './styles/fonts.css';
import './styles/fonts-fontshare.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/preloader.css';
import './styles/hero.css';
// после hero.css: .beam-text перебивает цвет .label; до секций: те задают свои --beam-*
import './styles/light.css';
import './styles/skills.css';
import './styles/work.css';
import './styles/case.css';
import './styles/tts-case.css';
import './styles/gallery.css';
import './styles/archive.css';
import './styles/poster.css';
import { GlyphField } from './field/glyph-field.js';
import { Preloader } from './brand/preloader.js';
import { onScrollFrame } from './motion/frame.js';
import { pauseOffscreen } from './motion/visibility.js';
import { bindDecrypt, decrypt, prepare } from './motion/decrypt.js';
import { reduced } from './motion/reduced.js';
import { SkillsWheel } from './sections/skills.js';
import { mountWork } from './sections/work.js';
import { mountCase } from './sections/case.js';
import { mountGallery } from './sections/gallery.js';
import { PosterDetail } from './sections/poster-detail.js';
import { POSTERS } from './sections/posters.js';

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
 * Строка с идеей под знаком: сколько фигур в поле и что их держит.
 * Число настоящее — поле считает свои фигуры при текущем размере экрана,
 * поэтому на телефоне и на большом мониторе оно разное.
 *
 * Строка встаёт под левый край знака по его габаритам, как подпись к рисунку.
 * Появляется дешифровкой один раз, когда уходит прелоадер; дальше на resize
 * число просто обновляется. Идёт перебор — новое число ждёт его конца.
 */
function bindIdea(canvas, el) {
  if (!el) return null;

  const phrase = (n) => `${n.toLocaleString('en-US').replace(/,/g, '\u00A0')} triangles. One system.`;
  let running = false;
  let pending = null;

  canvas.addEventListener('markbox', (e) => {
    const box = e.detail;
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top + box.height + box.cap * 0.2}px`;
    const text = phrase(box.count);
    if (running) pending = text;
    else prepare(el, text);
  });

  return {
    async reveal() {
      const text = el.dataset.text;
      if (!text) return;
      running = true;
      const shown = prepare(el, text);
      if (!reduced()) shown.textContent = '';
      el.classList.add('is-on');
      await decrypt(shown, text, { stagger: 28 });
      running = false;
      if (pending) prepare(el, pending);
      pending = null;
    },
  };
}

/**
 * Прокрутка уводит всё, кроме логотипа и города: знак и нижняя строка гаснут,
 * закреплённая верхняя строка остаётся. Значение отдаём в CSS одной переменной.
 */
function bindHeroFade(hero) {
  const targets = [...document.querySelectorAll('[data-hero-fade]')];
  if (!targets.length) return;

  // затухание считается от прокрутки, а не от геометрии: читать нечего,
  // блок живёт только в фазе записи общего кадра (see motion/frame.js)
  onScrollFrame(null, () => {
    const span = innerHeight * 0.55;
    const fade = Math.max(0, Math.min(1, 1 - scrollY / span));
    for (const el of targets) el.style.setProperty('--fade', fade.toFixed(3));
    hero.style.visibility = fade <= 0.001 ? 'hidden' : '';
  });
}

async function boot() {
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('[data-glyph-field]');
  if (!canvas || !hero) return;

  const preRoot = document.querySelector('[data-preloader]');
  const tm = bindTrademark(canvas, document.querySelector('[data-mark-tm]'));
  const idea = bindIdea(canvas, document.querySelector('[data-idea]'));

  const startField = () => {
    const field = new GlyphField(canvas);
    if (tm) field.attachSatellite(tm);
    field.resize();
    field.start();
    expose('__field', field);

    // пока hero вне экрана, поле не рисуется: незачем жечь кадры
    pauseOffscreen(hero, [field]);
    bindHeroFade(hero);
  };

  if (reduced() || !preRoot) {
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
  idea?.reveal();

  const skillsSection = document.querySelector('[data-skills]');
  if (skillsSection) {
    const skills = new SkillsWheel(skillsSection);
    expose('__skills', skills);
    // зрачок не крутится, пока блок за экраном
    pauseOffscreen(skillsSection, [skills.iris]);
  }

  // Архив: кольцо постеров и разворот карточки. Пока разворот открыт,
  // кольцо стоит — крутить фон под открытой панелью незачем
  const ringRoot = document.querySelector('[data-archive-ring]');
  if (ringRoot && POSTERS.length) {
    let ring = null;
    const detail = new PosterDetail({
      onOpen: () => { if (ring) ring.paused = true; },
      onClose: () => { if (ring) ring.paused = false; },
    });
    // карточек ровно столько, сколько постеров: лента конечная, у неё есть
    // последняя карточка, на которой кольцо останавливается
    ring = mountGallery(ringRoot, POSTERS, { drive: 'page', laps: 1, count: POSTERS.length });
    ring.onPick = (item, el) => detail.open(item, el);
    expose('__archive', ring);
  }

  mountCase(document.querySelector('[data-tts]'));
  expose('__work', mountWork(document.querySelector('[data-work]')));
  // метки секций и названия карт собираются из шума по атрибуту [data-decrypt]
  bindDecrypt(document.querySelector('main'));
}

boot();
