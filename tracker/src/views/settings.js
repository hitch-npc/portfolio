/**
 * Настройки: день и ввод, экран при запуске, движение; данные — резервная
 * копия, импорт из файла (копия, JSON, CSV, текст, Markdown) и вставка
 * списка. Копия уходит через «Поделиться» (на iPhone — «Сохранить в Файлы»),
 * где его нет — скачиванием. Импорт показывает, что изменится, и ждёт
 * подтверждения.
 */
import { h, openSheet, closeSheet, toast, autosize } from '../ui.js';
import { backupName, detect, makeBackup, packFiles, planImport, readBackup, readImportText } from '../io.js';
import { settingsOf } from '../logic.js';
import * as store from '../store.js';
import { VERSION } from '../version.js';
import { ui, header, backLink, pillButton } from './common.js';

async function exportBackup() {
  const st = store.getState();
  let json;
  try {
    json = JSON.stringify(makeBackup(st, new Date(), await packFiles(st.files)), null, 1);
  } catch (err) {
    console.error(err);
    toast('Could not read attachments for the backup');
    return;
  }
  const name = backupName(ui.day);
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // закрыли меню «Поделиться»
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function confirmSheet(title, lines, action, onConfirm) {
  openSheet(() => [
    h('h2', { class: 'sheet-title' }, title),
    h('ul', { class: 'sheet-list' }, lines.map((l) => h('li', null, l))),
    h('div', { class: 'sheet-actions' },
      pillButton(null, 'Cancel', closeSheet),
      pillButton(null, action, async () => {
        try {
          await onConfirm();
          closeSheet();
        } catch (err) {
          closeSheet();
          toast(`Import failed: ${err.message}`);
        }
      }, 'is-on')),
  ]);
}

/** Данные импорта (уже разобранные) → сводка и подтверждение. */
function importData(data) {
  const st = store.getState();
  const kind = detect(data);

  if (kind === 'backup') {
    let backup;
    try {
      backup = readBackup(data);
    } catch (err) {
      toast(err.message);
      return;
    }
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown date';
    confirmSheet('Restore backup?', [
      `Backup from ${when}`,
      `${plural(backup.tasks.length, 'task')}, ${plural(backup.spheres.length, 'sphere')}, ${plural(backup.goals.length, 'goal')}, ${plural(backup.files.length, 'file')}`,
      `Replaces everything on this device (now ${plural(st.tasks.length, 'task')}).`,
    ], 'Replace all', async () => {
      await store.restore(backup);
      toast('Backup restored');
    });
    return;
  }

  if (kind === 'import') {
    const plan = planImport(st, data, { uid: store.uid });
    const s = plan.summary;
    if (!s.tasks && !s.spheres && !s.goals && !s.steps) {
      toast(s.skipped ? `Nothing new — ${plural(s.skipped, 'duplicate')} skipped` : 'Nothing to import');
      return;
    }
    const planned = plan.tasks.filter((t) => t.day).length;
    confirmSheet('Import?', [
      `Add ${plural(s.tasks, 'task')}${planned ? `, ${planned} with a date` : ''}`,
      `${plural(s.spheres, 'new sphere')}, ${plural(s.goals, 'new goal')}, ${plural(s.steps, 'step')}`,
      s.skipped > 0 && `${plural(s.skipped, 'duplicate')} skipped`,
      'Existing data stays as it is.',
    ].filter(Boolean), 'Import', async () => {
      await store.applyImport(plan);
      toast(`Imported ${plural(s.tasks, 'task')}`);
    });
    return;
  }

  toast('Nothing to import here');
}

async function importFile(file) {
  const data = readImportText(file.name, await file.text(), ui.day);
  if (!data) {
    toast('This file is not valid JSON');
    return;
  }
  importData(data);
}

const EXAMPLE = `# Work
- Send the report @today !
- Call the bank due:2026-10-05
  - find the contract
# Home
- Buy a lamp @tomorrow`;

/** Шторка «вставить список»: текст или Markdown прямо из заметок. */
function pasteSheet() {
  let text = '';
  openSheet(() => [
    h('h2', { class: 'sheet-title' }, 'Paste a list'),
    h('p', { class: 'sheet-text' }, 'One task per line. Headings become spheres, indented lines — subtasks.'),
    autosize(h('textarea', {
      class: 'paste', rows: 6, placeholder: EXAMPLE, 'aria-label': 'Tasks', 'data-key': 'paste', value: text,
      oninput: (e) => { text = e.target.value; },
    })),
    h('div', { class: 'sheet-actions' },
      pillButton(null, 'Cancel', closeSheet),
      pillButton(null, 'Preview', () => {
        if (!text.trim()) {
          toast('Paste or type some tasks first');
          return;
        }
        importData(readImportText('pasted.txt', text, ui.day));
      }, 'is-on')),
  ]);
}

/** Строка настройки: подпись и пилюли вариантов, выбранный — чёрный. */
function choice(label, key, options, hint) {
  const current = settingsOf(store.getState())[key];
  return h('div', { class: 'setting' },
    h('span', { class: 'setting-label' }, label),
    h('div', { class: 'pills-scroll' }, h('div', { class: 'pills', role: 'group', 'aria-label': label },
      options.map(([value, text]) =>
        h('button', {
          class: ['pill', value === current && 'is-on'], type: 'button', 'aria-pressed': String(value === current),
          onclick: () => store.setSetting(key, value),
        }, text)))),
    hint && h('p', { class: 'setting-hint' }, hint));
}

export function settingsView() {
  const picker = h('input', {
    class: 'offscreen', type: 'file', tabindex: '-1', 'aria-hidden': 'true',
    accept: '.json,.csv,.tsv,.txt,.md,.markdown,application/json,text/csv,text/plain,text/markdown',
    onchange: (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (file) importFile(file);
    },
  });

  return h('section', { class: 'screen screen-settings' },
    backLink('#/today', 'Today'),
    header('Settings'),

    h('h2', { class: 'label' }, 'Planning'),
    h('section', { class: 'block-alt settings' },
      choice('Tasks per day', 'dayLimit', [[3, '3'], [5, '5'], [0, 'No limit']],
        'Open tasks that fit into one day. A full day asks which task to replace.'),
      choice('New tasks on Today', 'addTo', [['today', 'Go to today'], ['none', 'No date']])),

    h('h2', { class: 'label' }, 'Interface'),
    h('section', { class: 'block-alt settings' },
      choice('Open on launch', 'start', [['today', 'Today'], ['plan', 'Plan'], ['spheres', 'Spheres'], ['goals', 'Goals'], ['brief', 'Brief']]),
      choice('Motion', 'motion', [['system', 'As in system'], ['reduced', 'Reduced']])),

    h('h2', { class: 'label' }, 'Data'),
    h('section', { class: 'block-alt' },
      h('p', { class: 'block-text' }, 'Everything lives on this device only. Nothing is sent anywhere. Export a backup now and then — it is also how you move to a new phone. Attachments are included.'),
      h('div', { class: 'stack' },
        pillButton('download', 'Export backup', exportBackup, 'is-on pill-wide'),
        pillButton('upload', 'Import from file', () => picker.click(), 'pill-wide'),
        pillButton('plus', 'Paste a list', pasteSheet, 'pill-wide'),
        picker),
      h('p', { class: 'setting-hint' },
        'Files: backup, JSON, CSV (columns title, sphere, status, priority, deadline, day, note), text or Markdown. ',
        'In a list, @today or @2026-10-01 plans the day, due:2026-10-05 sets a deadline, ! marks high priority.')),

    h('p', { class: 'version' }, `Version ${VERSION}`),
    // кредит шрифта: лицензия OFL его не требует, но автору — спасибо
    h('p', { class: 'credit' }, 'Typeface: Geist by The Geist Project Authors (Vercel), SIL Open Font License 1.1.'));
}
