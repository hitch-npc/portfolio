/**
 * Песочница кольца.
 *
 * Нужна, чтобы решать про галерею цифрами, а не на глаз: слева живое кольцо,
 * справа все его параметры и счётчики кадра. Главный счётчик — не средний
 * FPS, а худший кадр за две секунды: подвисания видно именно по нему, а
 * среднее их прячет. Второй по важности — записей transform за кадр: это
 * прямая цена анимации. В установившемся режиме там должна стоять единица.
 *
 * Картинки генерируются на месте в выбранном размере. Так видно цену декода:
 * 25 растров по 900 px и 25 по 64 px дают одинаковую картинку на экране
 * и очень разную цену на слабой машине.
 *
 * Страница живёт только на dev-сервере: в сборку (build.rollupOptions.input)
 * она не входит.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/gallery.css';
import '../styles/poster.css';
import '../styles/lab.css';
import { GALLERY, CircularGallery } from '../sections/gallery.js';
import { PosterDetail } from '../sections/poster-detail.js';
import { POSTERS } from '../sections/posters.js';

const $ = (sel, root = document) => root.querySelector(sel);

/* ─── ручки ─────────────────────────────────────────────────────── */

const SLIDERS = [
  { group: 'Кольцо', key: 'count', label: 'карточек', min: 3, max: 60, step: 1 },
  { group: 'Кольцо', key: 'ringRadius', label: 'радиус', min: 80, max: 420, step: 2, unit: 'px' },
  { group: 'Кольцо', key: 'entryCards', label: 'карточек на наезд', min: 1, max: 8, step: 1 },
  { group: 'Карточка', key: 'cardW', label: 'ширина (без подгонки)', min: 8, max: 160, step: 1, unit: 'px' },
  { group: 'Карточка', key: 'cardH', label: 'высота', min: 8, max: 180, step: 1, unit: 'px' },
  { group: 'Карточка', key: 'cardRadius', label: 'скругление', min: 0, max: 40, step: 1, unit: 'px' },
  { group: 'Наезд', key: 'zoom', label: 'приближение', min: 0.5, max: 20, step: 0.1, unit: '×' },
  { group: 'Наезд', key: 'zoomOffset', label: 'подъём центра', min: -400, max: 400, step: 4, unit: 'px' },
  { group: 'Прокрутка', key: 'sensitivity', label: 'чувствительность', min: 0, max: 10, step: 0.5 },
  { group: 'Прокрутка', key: 'smoothing', label: 'инерция', min: 0, max: 10, step: 0.5 },
  { group: 'Прокрутка', key: 'maxSpeed', label: 'потолок скорости', min: 0, max: 30, step: 1, unit: ' карт/с' },
  { group: 'Прокрутка', key: 'tail', label: 'хвост трека (только «страница»)', min: 0, max: 0.4, step: 0.02 },
  { group: 'Прокрутка', key: 'laps', label: 'оборотов на трек', min: 1, max: 4, step: 1 },
  { group: 'Курсор', key: 'reach', label: 'радиус действия', min: 0, max: 10, step: 0.5 },
  { group: 'Курсор', key: 'strength', label: 'сила', min: 0, max: 10, step: 0.5 },
  { group: 'Курсор', key: 'parallax', label: 'наклон сцены', min: 0, max: 10, step: 0.5 },
];

const IMAGE_MODES = {
  posters: { label: `постеры — ${POSTERS.length} шт.`, px: -1 },
  gradient: { label: 'градиенты (без <img>)', px: 0 },
  px64: { label: 'растр 64 px', px: 64 },
  px256: { label: 'растр 256 px', px: 256 },
  px900: { label: 'растр 900 px', px: 900 },
};

// песочница заводится в том же составе, что и витрина: карточек по числу
// постеров, иначе ступени меряются не на той ленте
const params = { ...GALLERY, count: POSTERS.length || GALLERY.count };
let mode = POSTERS.length ? 'posters' : 'gradient';
let gallery = null;
let items = [];
let held = false;   // пауза с пульта: разворот её не должен снимать

// разворот постера. Пока он открыт, кольцо стоит: крутить фон под
// открытой панелью незачем, а замеры кадра так остаются честными
const detail = new PosterDetail({
  onOpen: () => { if (gallery) gallery.paused = true; },
  onClose: () => { if (gallery) gallery.paused = held; },
});

/* ─── картинки ──────────────────────────────────────────────────── */

/** Рисует N разных растров заданного размера. Пиксели настоящие: декод честный. */
async function bakeImages(px, n = 12) {
  // адреса постеров отдаёт сборщик, отзывать их нельзя — только свои blob
  for (const it of items) if (typeof it === 'string' && it.startsWith('blob:')) URL.revokeObjectURL(it);
  items = [];
  if (px < 0) {
    // постеры идут целиком, вместе с текстами: по ним и строится разворот
    items = POSTERS;
    return items;
  }
  if (!px) return items;

  for (let i = 0; i < n; i += 1) {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round(px * 1.125);
    const g = c.getContext('2d');
    const hue = (i * 47 + 210) % 360;
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, `hsl(${hue} 38% 34%)`);
    grad.addColorStop(1, `hsl(${(hue + 45) % 360} 52% 9%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    // шум: сплошная заливка жмётся в килобайт и обманывает замер декода
    const step = Math.max(1, px >> 6);
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        g.fillStyle = `hsl(${hue} 30% ${(Math.random() * 60) | 0}% / 0.16)`;
        g.fillRect(x, y, step, step);
      }
    }
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    items.push(URL.createObjectURL(blob));
  }
  return items;
}

/* ─── сборка сцены ──────────────────────────────────────────────── */

function mountScene() {
  gallery?.destroy();
  const view = $('[data-view]');
  view.textContent = '';

  let host;
  if (params.drive === 'page') {
    // трек в три экрана: кольцо закреплено, прокручивается страница
    const track = document.createElement('div');
    track.className = 'lab__track';
    track.dataset.galleryTrack = '';
    track.style.height = `${100 + params.laps * 200}vh`;
    const pin = document.createElement('div');
    pin.className = 'lab__pin';
    host = document.createElement('div');
    host.className = 'lab__host';
    pin.append(host);
    track.append(pin);
    view.append(track);
  } else {
    const frame = document.createElement('div');
    frame.className = 'lab__frame';
    host = document.createElement('div');
    host.className = 'lab__host';
    frame.append(host);
    view.append(frame);
    scrollTo(0, 0);
  }

  gallery = new CircularGallery(host, items, params);
  // разворот есть только у постеров: у нарисованных растров нет ни текстов,
  // ни материалов — открывать было бы нечего
  gallery.onPick = (item, el) => { if (item.slug) detail.open(item, el); };
  gallery.paused = held;
  gallery.start();
  window.__gallery = gallery;
}

/* ─── счётчики ──────────────────────────────────────────────────── */

const HIST = 120;
const history = new Array(HIST).fill(0);
let hi = 0;

function mountStats(box) {
  const cell = (key, name) => {
    const d = document.createElement('div');
    d.className = 'lab__stat';
    d.dataset.k = key;
    d.innerHTML = `<span>${name}</span><span data-v>—</span>`;
    box.append(d);
    return d;
  };

  const fps = cell('fps', 'FPS');
  const worst = cell('worst', 'худший кадр');
  const writes = cell('writes', 'записей/кадр');
  const nodes = cell('nodes', 'узлов');

  const spark = document.createElement('canvas');
  spark.className = 'lab__spark';
  box.append(spark);
  const sg = spark.getContext('2d');

  let frames = 0;
  let acc = 0;
  let peak = 0;
  let peakAge = 0;
  let last = 0;

  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--fg-muted').trim();
  const warn = style.getPropertyValue('--tag-ux').trim();
  const line = style.getPropertyValue('--line').trim();

  const draw = () => {
    const w = spark.clientWidth;
    const h = spark.clientHeight;
    if (spark.width !== w) { spark.width = w; spark.height = h; }
    sg.clearRect(0, 0, w, h);

    // порог 16.7 мс — граница 60 кадров в секунду
    sg.strokeStyle = line;
    sg.beginPath();
    const y60 = h - (16.7 / 50) * h;
    sg.moveTo(0, y60);
    sg.lineTo(w, y60);
    sg.stroke();

    for (let i = 0; i < HIST; i += 1) {
      const ms = history[(hi + i) % HIST];
      if (!ms) continue;
      const x = (i / HIST) * w;
      const bh = Math.min(h, (ms / 50) * h);
      sg.fillStyle = ms > 16.7 ? warn : ink;
      sg.fillRect(x, h - bh, w / HIST + 0.5, bh);
    }
  };

  const tick = (now) => {
    requestAnimationFrame(tick);
    if (!last) { last = now; return; }
    const ms = now - last;
    last = now;

    history[hi] = ms;
    hi = (hi + 1) % HIST;

    frames += 1;
    acc += ms;
    if (ms > peak) { peak = ms; peakAge = now; }
    if (now - peakAge > 2000) peak = ms;

    if (acc >= 400) {
      const f = Math.round((frames / acc) * 1000);
      fps.querySelector('[data-v]').textContent = f;
      fps.dataset.warn = f < 50 ? '1' : '0';
      worst.querySelector('[data-v]').textContent = `${peak.toFixed(1)} мс`;
      worst.dataset.warn = peak > 20 ? '1' : '0';
      writes.querySelector('[data-v]').textContent = gallery ? gallery.writes : '—';
      nodes.querySelector('[data-v]').textContent = document.querySelectorAll('.gallery__card').length;
      frames = 0;
      acc = 0;
      draw();
    }
  };
  requestAnimationFrame(tick);
}

/* ─── пульт ─────────────────────────────────────────────────────── */

function row(parent, label) {
  const r = document.createElement('div');
  r.className = 'lab__row';
  const l = document.createElement('label');
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'lab__val';
  r.append(l, v);
  parent.append(r);
  return { r, l, v };
}

function mountPanel() {
  const panel = $('[data-panel]');

  const head = document.createElement('div');
  head.innerHTML = '<h1 class="lab__title">Circular Gallery · песочница</h1>'
    + '<p class="lab__hint">Крути ручки. Смотри на «худший кадр», не на FPS: '
    + 'подвисание — это один кадр в 40 мс, среднее его съедает.</p>';
  panel.append(head);

  const stats = document.createElement('div');
  stats.className = 'lab__stats';
  panel.append(stats);
  mountStats(stats);

  // режимы
  const modes = document.createElement('div');
  modes.className = 'lab__group';
  modes.innerHTML = '<div class="lab__legend">Режим</div>';
  panel.append(modes);

  const driveRow = row(modes, 'прокрутка');
  const drive = document.createElement('select');
  drive.innerHTML = '<option value="wheel">колесо внутри блока</option>'
    + '<option value="page">прокрутка страницы</option>';
  drive.value = params.drive;
  driveRow.r.append(drive);
  driveRow.v.remove();
  drive.addEventListener('change', () => { params.drive = drive.value; mountScene(); });

  const imgRow = row(modes, 'картинки');
  const img = document.createElement('select');
  img.innerHTML = Object.entries(IMAGE_MODES)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('');
  img.value = mode;
  imgRow.r.append(img);
  imgRow.v.remove();
  img.addEventListener('change', async () => {
    mode = img.value;
    await bakeImages(IMAGE_MODES[mode].px);
    gallery.setImages(items);
    gallery.root.classList.toggle('is-picked', mode !== 'posters');
  });

  const fit = document.createElement('label');
  fit.className = 'lab__check';
  fit.innerHTML = '<input type="checkbox" checked><span>карточка по пропорциям постера</span>';
  modes.append(fit);
  fit.querySelector('input').addEventListener('change', (e) => {
    params.fit = e.target.checked;
    gallery.setParams({ fit: e.target.checked });
  });

  const snap = document.createElement('label');
  snap.className = 'lab__check';
  snap.innerHTML = '<input type="checkbox" checked><span>ступени по карточкам</span>';
  modes.append(snap);
  snap.querySelector('input').addEventListener('change', (e) => {
    params.snap = e.target.checked;
    gallery.setParams({ snap: e.target.checked });
  });

  const naive = document.createElement('label');
  naive.className = 'lab__check';
  naive.innerHTML = '<input type="checkbox"><span>наивный режим (как в оригинале)</span>';
  modes.append(naive);
  naive.querySelector('input').addEventListener('change', (e) => {
    params.naive = e.target.checked;
    gallery.setParams({ naive: e.target.checked });
  });

  const pause = document.createElement('label');
  pause.className = 'lab__check';
  pause.innerHTML = '<input type="checkbox"><span>пауза кольца</span>';
  modes.append(pause);
  pause.querySelector('input').addEventListener('change', (e) => {
    held = e.target.checked;
    gallery.paused = held;
  });

  // тормоз: занимает поток ровно столько, сколько просят. Так видно,
  // при каком запасе кадра кольцо начинает ронять кадры — на этой машине
  // до предела не достать, а на слабой он ровно тут и стоит
  const loadRow = row(modes, 'тормоз ЦП');
  const load = document.createElement('input');
  load.type = 'range';
  Object.assign(load, { min: 0, max: 14, step: 0.5, value: 0 });
  loadRow.r.append(load);
  loadRow.v.textContent = '0 мс/кадр';
  let burn = 0;
  const burner = () => {
    requestAnimationFrame(burner);
    if (!burn) return;
    const end = performance.now() + burn;
    while (performance.now() < end) { /* держим поток */ }
  };
  requestAnimationFrame(burner);
  load.addEventListener('input', () => {
    burn = +load.value;
    loadRow.v.textContent = `${burn} мс/кадр`;
  });

  // слайдеры по группам
  let group = null;
  let groupName = '';
  for (const s of SLIDERS) {
    if (s.group !== groupName) {
      groupName = s.group;
      group = document.createElement('div');
      group.className = 'lab__group';
      group.innerHTML = `<div class="lab__legend">${groupName}</div>`;
      panel.append(group);
    }
    const { r, v } = row(group, s.label);
    const input = document.createElement('input');
    input.type = 'range';
    Object.assign(input, { min: s.min, max: s.max, step: s.step, value: params[s.key] });
    r.append(input);
    const show = () => { v.textContent = `${params[s.key]}${s.unit ?? ''}`; };
    show();
    input.addEventListener('input', () => {
      params[s.key] = +input.value;
      show();
      // трек зависит от числа оборотов — его длину задаёт разметка, не кольцо
      if (s.key === 'laps' && params.drive === 'page') mountScene();
      else gallery.setParams({ [s.key]: +input.value });
    });
  }

  // вывод
  const out = document.createElement('div');
  out.className = 'lab__group';
  const btns = document.createElement('div');
  btns.className = 'lab__btns';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'lab__btn';
  copy.textContent = 'Скопировать параметры';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'lab__btn';
  reset.textContent = 'Сброс';
  btns.append(copy, reset);
  const pre = document.createElement('pre');
  pre.className = 'lab__out';
  out.append(btns, pre);
  panel.append(out);

  const dump = () => {
    const diff = Object.fromEntries(
      Object.entries(params).filter(([k, v]) => v !== GALLERY[k])
    );
    pre.textContent = Object.keys(diff).length
      ? JSON.stringify(diff, null, 2)
      : '// всё по умолчанию';
    return pre.textContent;
  };
  dump();

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dump());
      copy.textContent = 'Скопировано';
      setTimeout(() => { copy.textContent = 'Скопировать параметры'; }, 1200);
    } catch {
      /* буфер недоступен — параметры и так на экране */
    }
  });

  reset.addEventListener('click', () => { location.reload(); });

  // любой сдвиг ручки обновляет вывод
  panel.addEventListener('input', dump);
  panel.addEventListener('change', dump);
}

/* ─── старт ─────────────────────────────────────────────────────── */

await bakeImages(IMAGE_MODES[mode].px);
mountScene();
mountPanel();
