/**
 * Настройки: резервная копия в JSON и импорт из файла.
 * Копия уходит через «Поделиться» (на iPhone — «Сохранить в Файлы»),
 * где его нет — скачиванием. Импорт показывает, что изменится, и ждёт
 * подтверждения.
 */
import { h, openSheet, closeSheet, toast } from '../ui.js';
import { backupName, detect, makeBackup, planImport, readBackup } from '../io.js';
import * as store from '../store.js';
import { VERSION } from '../version.js';
import { ui, header, backLink, pillButton } from './common.js';

async function exportBackup() {
  const json = JSON.stringify(makeBackup(store.getState()), null, 1);
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

async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('This file is not valid JSON');
    return;
  }
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
      `${plural(backup.tasks.length, 'task')}, ${plural(backup.spheres.length, 'sphere')}, ${plural(backup.goals.length, 'goal')}`,
      `Replaces everything on this device (now ${plural(st.tasks.length, 'task')}).`,
    ], 'Replace all', async () => {
      await store.restore(backup);
      toast('Backup restored');
    });
    return;
  }

  if (kind === 'import') {
    const plan = planImport(st, data, { uid: store.uid, today: ui.day });
    const s = plan.summary;
    if (!s.tasks && !s.spheres && !s.goals && !s.steps) {
      toast(s.skipped ? `Nothing new — ${plural(s.skipped, 'duplicate')} skipped` : 'Nothing to import');
      return;
    }
    confirmSheet('Import file?', [
      `Add ${plural(s.tasks, 'task')}`,
      `${plural(s.spheres, 'new sphere')}, ${plural(s.goals, 'new goal')}, ${plural(s.steps, 'step')}`,
      s.skipped > 0 && `${plural(s.skipped, 'duplicate')} skipped`,
      'Existing data stays as it is.',
    ].filter(Boolean), 'Import', async () => {
      await store.applyImport(plan);
      toast(`Imported ${plural(s.tasks, 'task')}`);
    });
    return;
  }

  toast('Unrecognised file: expected a tracker backup or import');
}

export function settingsView() {
  const picker = h('input', {
    class: 'offscreen', type: 'file', accept: 'application/json,.json', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (file) importFile(file);
    },
  });

  return h('section', { class: 'screen screen-settings' },
    backLink('#/today', 'Today'),
    header('Settings', 'Data & backup'),
    h('section', { class: 'block block-alt' },
      h('p', { class: 'block-text' }, 'Everything lives on this device only. Nothing is sent anywhere. Export a backup now and then — it is also how you move to a new phone.'),
      h('div', { class: 'stack' },
        pillButton('download', 'Export backup', exportBackup, 'is-on pill-wide'),
        pillButton('upload', 'Import from file', () => picker.click(), 'pill-wide'),
        picker)),
    h('p', { class: 'version' }, `Version ${VERSION}`),
    // кредит шрифта: лицензия OFL его не требует, но автору — спасибо
    h('p', { class: 'credit' }, 'Typeface: Geist by The Geist Project Authors (Vercel), SIL Open Font License 1.1.'));
}
