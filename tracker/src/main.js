/**
 * Трекер — вход. Загружает данные, рисует экран по адресу (#/today, #/plan,
 * #/spheres[/id], #/goals, #/brief, #/settings) и перерисовывает его после
 * каждого изменения. В полночь «сегодня» сдвигается само.
 */
import { h, icon, keepFocus, renderSheet, closeSheet, toast } from './ui.js';
import { addDays, todayISO } from './dates.js';
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

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  return ROUTES[name] ? { name, arg } : { name: 'today', arg: undefined };
}

function render() {
  ui.day = todayISO();
  ui.tomorrow = addDays(ui.day, 1);
  const r = route();
  keepFocus(() => {
    const node = ROUTES[r.name](r.arg);
    if (main.firstChild !== node) main.replaceChildren(node);
    renderSheet();
  });
  for (const a of navLinks) {
    const on = a.dataset.tab === r.name;
    a.classList.toggle('is-on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
}

function buildNav() {
  navLinks = TABS.map(([id, label]) =>
    h('a', { class: 'tab', href: `#/${id}`, 'data-tab': id }, icon(id), h('span', { class: 'tab-label' }, label)));
  document.getElementById('nav').replaceChildren(h('div', { class: 'tabs' }, navLinks));
}

function onRoute() {
  ui.expanded = null;
  ui.confirm = null;
  closeSheet();
  render();
  window.scrollTo(0, 0);
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

  render();
  if (route().name === 'today') focusInput();
  window.addEventListener('hashchange', onRoute);

  // новый день, пока приложение открыто или свёрнуто
  const tick = () => { if (todayISO() !== ui.day) render(); };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  setInterval(tick, 60_000);

  // просим браузер не вычищать базу при нехватке места
  navigator.storage?.persist?.().catch(() => {});

  // тема строки состояния — из токена, чтобы цвет жил в одном месте
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);

  if ('serviceWorker' in navigator && VERSION !== 'dev') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error(err));
  }
}

boot();
