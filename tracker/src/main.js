/**
 * Трекер — вход. Загружает данные, рисует экран по адресу (#/today, #/plan,
 * #/spheres[/id], #/goals, #/brief, #/settings) и перерисовывает его после
 * каждого изменения. В полночь «сегодня» сдвигается само.
 */
import { h, keepFocus, renderSheet, closeSheet, toast, sectionIcon, calm, settlePress } from './ui.js';
import { addDays, todayISO } from './dates.js';
import { overdue, settingsOf } from './logic.js';
import * as store from './store.js';
import { VERSION } from './version.js';
import { ui, setRerender } from './views/common.js';
import { todayView, focusInput } from './views/today.js';
import { planView } from './views/plan.js';
import { spheresView, sphereView } from './views/spheres.js';
import { goalsView } from './views/goals.js';
import { briefView } from './views/brief.js';
import { settingsView } from './views/settings.js';

const ROUTES = {
  today: todayView,
  plan: planView,
  spheres: (arg) => (arg ? sphereView(arg) : spheresView()),
  goals: goalsView,
  brief: briefView,
  settings: settingsView,
};

const TABS = [
  ['today', 'Today'],
  ['plan', 'Plan'],
  ['spheres', 'Spheres'],
  ['goals', 'Goals'],
  ['brief', 'Brief'],
];

const main = document.getElementById('main');
let navLinks = [];
let tabs;
let lateDot;

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return ROUTES[name] ? { name, arg } : { name: 'today', arg: undefined };
}

function render() {
  ui.day = todayISO();
  ui.tomorrow = addDays(ui.day, 1);
  // «Уменьшить движение» из настроек приложения — поверх системной
  document.documentElement.dataset.motion = settingsOf(store.getState()).motion;
  const r = route();
  // появление экрана играет только при входе на него: тап в первую секунду
  // не должен проигрывать его заново на новых узлах
  if (!ui.entering) main.classList.remove('is-entering');
  settlePress(() => keepFocus(() => {
    const node = ROUTES[r.name](r.arg);
    if (main.firstChild !== node) main.replaceChildren(node);
    renderSheet();
  }));
  // у экрана свой фон (вечернее планирование — серое), строка состояния — в тон
  if (document.body.dataset.screen !== r.name) {
    document.body.dataset.screen = r.name;
    const bg = getComputedStyle(document.body).getPropertyValue('--screen').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }
  // светлая плашка под открытой вкладкой переезжает на её место;
  // на экранах вне вкладок (настройки) — прячется
  const at = TABS.findIndex(([id]) => id === r.name);
  tabs.style.setProperty('--at', String(Math.max(at, 0)));
  tabs.classList.toggle('is-idle', at < 0);
  for (const a of navLinks) {
    const on = a.dataset.tab === r.name;
    a.classList.toggle('is-on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    // двигается только иконка открытой вкладки — и каждый раз с начала
    const box = a.querySelector('.tab-icon');
    const live = String(on && !calm());
    if (box.dataset.live !== live) {
      box.dataset.live = live;
      box.querySelector('svg').replaceWith(sectionIcon(a.dataset.tab, live === 'true'));
    }
  }
  // красная точка на «Today» — есть просроченное: ровно то, что значит акцент
  lateDot.hidden = !overdue(store.getState(), ui.day).length;
}

function buildNav() {
  lateDot = h('span', { class: 'tab-dot', hidden: true });
  navLinks = TABS.map(([id, label]) =>
    h('a', { class: 'tab', href: `#/${id}`, 'data-tab': id },
      h('span', { class: 'tab-icon', 'data-live': 'false' }, sectionIcon(id), id === 'today' && lateDot),
      h('span', { class: 'tab-label' }, label)));
  tabs = h('div', { class: 'tabs' }, h('span', { class: 'tab-indicator', 'aria-hidden': 'true' }), navLinks);
  document.getElementById('nav').replaceChildren(tabs);
}

let enterTimer;

/** Вход на экран: одна перерисовка с анимациями появления, дальше — без них. */
function enter() {
  ui.entering = true;
  main.classList.add('is-entering');
  render();
  ui.entering = false;
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => main.classList.remove('is-entering'), 900);
}

function onRoute() {
  ui.expanded = null;
  ui.confirm = null;
  ui.select = null;
  ui.query = '';
  closeSheet(false);
  window.scrollTo(0, 0);
  enter();
  if (route().name === 'today') focusInput();
}

async function boot() {
  setRerender(render);
  store.subscribe(render);
  store.setErrorHandler((err) => {
    console.error(err);
    toast('Could not save — check storage space');
  });
  buildNav();

  try {
    await store.load();
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('p', { class: 'hint' }, 'Storage is unavailable. In Safari, private browsing blocks it.'));
    return;
  }

  // экран при запуске — из настроек; ссылка на конкретный экран важнее
  const start = settingsOf(store.getState()).start;
  if (start !== 'today' && ROUTES[start] && /^#?\/?(today)?$/.test(location.hash)) location.replace(`#/${start}`);

  enter();
  if (route().name === 'today') focusInput();
  window.addEventListener('hashchange', onRoute);

  // новый день, пока приложение открыто или свёрнуто
  const tick = () => { if (todayISO() !== ui.day) render(); };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  setInterval(tick, 60_000);

  // просим браузер не вычищать базу при нехватке места
  navigator.storage?.persist?.().catch(() => {});

  if ('serviceWorker' in navigator && VERSION !== 'dev') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error(err));
  }
}

boot();
