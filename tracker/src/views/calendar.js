/**
 * Напоминание через Календарь. Веб-приложение само не покажет уведомление
 * в заданное время, а Календарь — покажет: задача с днём превращается
 * в файл события (.ics) с оповещением, и его добавляют в Календарь.
 * Файл собирается на устройстве и никуда не отправляется.
 */
import { h, openSheet, closeSheet, renderSheet, toast } from '../ui.js';
import { ALERTS_DAY, ALERTS_TIMED, icsName, toICS } from '../io.js';
import * as store from '../store.js';
import { pillButton } from './common.js';
import { whenLabel } from './pickers.js';

/* последний выбор оповещения — пока открыто приложение */
const alertFor = { timed: '0', day: 'morning' };

function icsFile(t, alert) {
  const sphere = store.getState().spheres.find((s) => s.id === t.sphereId)?.name;
  return new File([toICS(t, { alert, sphere })], icsName(t.title), { type: 'text/calendar' });
}

/** Открыть файл: Safari показывает событие с кнопкой «Добавить в Календарь». */
function openFile(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Запасной путь: «Поделиться» → «Сохранить в Файлы», оттуда — в Календарь. */
async function shareFile(file) {
  if (!navigator.canShare?.({ files: [file] })) {
    openFile(file);
    return;
  }
  try {
    await navigator.share({ files: [file], title: file.name });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Could not share the file');
  }
}

export function calendarSheet(id) {
  openSheet(() => {
    const t = store.getState().tasks.find((x) => x.id === id);
    if (!t?.day) return [];
    const kind = t.time ? 'timed' : 'day';
    const options = t.time ? ALERTS_TIMED : ALERTS_DAY;
    return [
      h('h2', { class: 'sheet-title' }, 'Add to Calendar'),
      h('p', { class: 'sheet-text sheet-strong' }, t.title),
      h('p', { class: 'sheet-text muted' }, `${whenLabel(t)} · ${t.time ? '30 min' : 'all day'}`),
      h('div', { class: 'setting sheet-setting' },
        h('span', { class: 'setting-label' }, 'Alert'),
        h('div', { class: 'pills', role: 'group', 'aria-label': 'Alert' }, options.map(([value, label]) =>
          h('button', {
            class: ['pill', alertFor[kind] === value && 'is-on'], type: 'button', 'aria-pressed': String(alertFor[kind] === value),
            onclick: () => { alertFor[kind] = value; renderSheet(); },
          }, label)))),
      h('div', { class: 'stack' },
        pillButton('calendar', 'Add to Calendar', () => openFile(icsFile(t, alertFor[kind])), 'is-on pill-wide'),
        pillButton('share', 'Share or save .ics', () => shareFile(icsFile(t, alertFor[kind])), 'pill-wide')),
      h('p', { class: 'setting-hint sheet-hint' },
        'The alert comes from the Calendar app. If Calendar does not open, tap Share or save .ics → Save to Files, then open the file in Files and tap Add to Calendar. ',
        'Later changes to the task do not update the event.'),
      pillButton(null, 'Close', closeSheet, 'pill-wide'),
    ];
  });
}
