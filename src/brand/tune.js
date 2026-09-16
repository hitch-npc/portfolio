/**
 * Панель подбора параметров знака. Только для разработки: ?tune в адресе.
 * Структурные параметры требуют пересборки маски и сетки, живые — нет.
 */
const STRUCTURAL = new Set(['text', 'tracking', 'fit', 'cell', 'blur', 'rowsPerCap', 'blurRatio']);

const CONTROLS = [
  ['rowsPerCap', 6, 30, 1],
  ['blurRatio', 0, 1.2, 0.02],
  ['fit', 0.4, 0.98, 0.01],
  ['tracking', -0.05, 0.3, 0.005],
  ['arrowMin', 0, 1, 0.01],
  ['arrowMax', 0.3, 2, 0.01],
  ['headRatio', 0, 0.6, 0.01],
  ['weight', 0.5, 4, 0.05],
  ['ghost', 0, 0.3, 0.005],
  ['flowScale', 0.5, 8, 0.1],
  ['flowSpeed', 0, 1, 0.01],
  ['breathe', 0, 1, 0.02],
  ['breatheScale', 0.4, 4, 0.05],
  ['breatheSpeed', 0, 0.4, 0.005],
  ['mouseRadius', 60, 600, 10],
  ['swirl', 0, 1, 0.02],
  ['push', 0, 120, 1],
];

export function mountTunePanel(field) {
  const panel = document.createElement('div');
  panel.className = 'tune';
  panel.innerHTML = '<p class="tune__title">glyph field</p>';

  for (const [key, min, max, step] of CONTROLS) {
    const row = document.createElement('label');
    row.className = 'tune__row';
    row.innerHTML = `<span class="tune__key">${key}</span><span class="tune__val"></span>`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(field.p[key]);

    const out = row.querySelector('.tune__val');
    out.textContent = String(field.p[key]);

    input.addEventListener('input', () => {
      const v = Number(input.value);
      field.p[key] = v;
      out.textContent = String(v);
      if (STRUCTURAL.has(key)) field.resize();
    });

    row.appendChild(input);
    panel.appendChild(row);
  }

  const dump = document.createElement('button');
  dump.type = 'button';
  dump.className = 'tune__dump';
  dump.textContent = 'copy params';
  dump.addEventListener('click', () => {
    navigator.clipboard?.writeText(JSON.stringify(field.p, null, 2));
    dump.textContent = 'copied';
    setTimeout(() => { dump.textContent = 'copy params'; }, 1200);
  });
  panel.appendChild(dump);

  document.body.appendChild(panel);
}
