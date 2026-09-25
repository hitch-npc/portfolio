/**
 * Настройки: оформление (Minimal или Colour, светлая или тёмная тема), день
 * и ввод, экран при запуске, движение; ИИ — инструкция для
 * любого чата (с данными или без) и вставка его ответа; данные — резервная
 * копия, импорт из файла (копия, JSON, CSV, текст, Markdown) и вставка
 * списка. Копия уходит через «Поделиться» (на iPhone — «Сохранить в Файлы»),
 * где его нет — скачиванием. Импорт показывает, что изменится, и ждёт
 * подтверждения.
 */
import { h, openSheet, closeSheet, toast, autosize, copyText, calm, closeCheckIcon, flashCheck } from '../ui.js';
import {
  aiData, aiPrompt, backupName, detect, makeBackup, packFiles, planImport, readBackup, readImportText,
} from '../io.js';
import { dayLimit, settingsOf } from '../logic.js';
import * as store from '../store.js';
import { VERSION } from '../version.js';
import { ui, header, pillButton } from './common.js';

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
    const adds = s.tasks + s.spheres + s.goals + s.steps;
    if (!adds && !s.changed && !s.deleted.length) {
      toast(s.skipped ? `Nothing new — ${plural(s.skipped, 'duplicate')} skipped` : 'Nothing to import');
      return;
    }
    const planned = plan.tasks.filter((t) => t.day).length;
    const shown = s.deleted.slice(0, 5).map((t) => `“${t}”`).join(', ');
    confirmSheet(s.changed || s.deleted.length ? 'Apply changes?' : 'Import?', [
      s.tasks > 0 && `Add ${plural(s.tasks, 'task')}${planned ? `, ${planned} with a date` : ''}`,
      (s.spheres || s.goals || s.steps) > 0 && `${plural(s.spheres, 'new sphere')}, ${plural(s.goals, 'new goal')}, ${plural(s.steps, 'step')}`,
      s.changed > 0 && `Change ${plural(s.changed, 'entry').replace('entrys', 'entries')}${s.done ? ` — ${s.done} marked done` : ''}`,
      s.deleted.length > 0 && `Delete ${plural(s.deleted.length, 'entry').replace('entrys', 'entries')}: ${shown}${s.deleted.length > 5 ? '…' : ''}`,
      s.skipped > 0 && `${plural(s.skipped, 'duplicate')} skipped`,
      s.noRoom > 0 && `${plural(s.noRoom, 'task')} not moved — the day is full`,
      s.notFound > 0 && `${s.notFound} not found — skipped`,
      !s.changed && !s.deleted.length && 'Existing data stays as it is.',
    ].filter(Boolean), s.changed || s.deleted.length ? 'Apply' : 'Import', async () => {
      await store.applyImport(plan);
      toast([
        s.tasks && `+${plural(s.tasks, 'task')}`, s.changed && `${s.changed} changed`, s.deleted.length && `${s.deleted.length} deleted`,
      ].filter(Boolean).join(' · ') || 'Imported');
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

/**
 * Шторка «вставить»: список текстом или Markdown прямо из заметок — или
 * ответ ИИ целиком (JSON найдётся в блоке кода).
 */
function pasteSheet(ai = false) {
  let text = '';
  openSheet(() => [
    h('h2', { class: 'sheet-title' }, ai ? 'Paste AI answer' : 'Paste a list'),
    h('p', { class: 'sheet-text' }, ai
      ? 'Paste the whole reply — the app finds the JSON in it and shows what will change.'
      : 'One task per line. Headings become spheres, indented lines — subtasks.'),
    autosize(h('textarea', {
      class: 'paste', rows: 6, placeholder: ai ? 'Sure! Here is your plan… ```json { "tasks": [ … ] } ```' : EXAMPLE,
      'aria-label': ai ? 'AI answer' : 'Tasks', 'data-key': 'paste', value: text,
      oninput: (e) => { text = e.target.value; },
    })),
    h('div', { class: 'sheet-actions' },
      pillButton(null, 'Cancel', closeSheet),
      pillButton(null, 'Preview', () => {
        if (!text.trim()) {
          toast(ai ? 'Paste the AI answer first' : 'Paste or type some tasks first');
          return;
        }
        importData(readImportText('pasted.txt', text, ui.day));
      }, 'is-on')),
  ]);
}

/** Инструкция для ИИ — в буфер; с данными — чтобы ИИ мог и поменять, а не только добавить. */
async function copyPrompt(withData) {
  const st = store.getState();
  const prompt = aiPrompt({ today: ui.day, limit: dayLimit(st), data: withData ? aiData(st) : null });
  toast((await copyText(prompt)) ? 'Copied — paste it into the AI chat' : 'Could not copy');
}

/**
 * Смена оформления — наплывом старого экрана в новый (без View Transitions
 * и при Fewer — сразу); потом крестик на миг становится галочкой: сохранено.
 */
function restyle(fn) {
  const confirm = () => flashCheck(document.querySelector('.corner-btn svg'));
  if (document.startViewTransition && !calm()) document.startViewTransition(fn).finished.finally(confirm);
  else {
    fn();
    confirm();
  }
}

/** Строка настройки: подпись и пилюли вариантов, выбранный — залит. smooth — сменить наплывом. */
function choice(label, key, options, hint, smooth = false) {
  const current = settingsOf(store.getState())[key];
  return h('div', { class: 'setting' },
    h('span', { class: 'setting-label' }, label),
    h('div', { class: 'pills-scroll' }, h('div', { class: 'pills', role: 'group', 'aria-label': label },
      options.map(([value, text]) =>
        h('button', {
          class: ['pill', value === current && 'is-on'], type: 'button', 'aria-pressed': String(value === current),
          onclick: () => {
            const set = () => store.setSetting(key, value);
            if (smooth) restyle(set);
            else set();
          },
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
    // закрыть — там же, где была шестерёнка: палец уже знает это место
    header('Settings', null, h('a', {
      class: 'icon-btn corner-btn', href: '#/today', 'aria-label': 'Close settings', title: 'Close',
    }, closeCheckIcon())),

    h('h2', { class: 'label' }, 'Appearance'),
    h('section', { class: 'block-alt settings' },
      choice('Style', 'palette', [['minimal', 'Minimal'], ['colour', 'Colour']],
        'Colour — every sphere gets its own colour: its tile and the tags on its tasks. Change it in the sphere’s ⋯ menu.', true),
      choice('Theme', 'theme', [['light', 'Light'], ['dark', 'Dark']], null, true)),

    h('h2', { class: 'label' }, 'Planning'),
    h('section', { class: 'block-alt settings' },
      choice('Tasks per day', 'dayLimit', [[3, '3'], [5, '5'], [0, 'No limit']],
        'Open tasks that fit into one day. A full day asks which task to replace.'),
      choice('New tasks on Today', 'addTo', [['today', 'Go to today'], ['none', 'No date']])),

    h('h2', { class: 'label' }, 'Interface'),
    h('section', { class: 'block-alt settings' },
      choice('Open on launch', 'start', [['today', 'Today'], ['plan', 'Plan'], ['spheres', 'Spheres'], ['goals', 'Goals'], ['brief', 'Overview']]),
      choice('Animations', 'motion', [['system', 'Full'], ['reduced', 'Fewer']],
        'Fewer — no sliding and bouncing, for when motion is tiring. With Reduce Motion on in iPhone settings, animations are fewer anyway.')),

    h('h2', { class: 'label' }, 'AI'),
    h('section', { class: 'block-alt' },
      h('p', { class: 'block-text' },
        'Let any AI chat — ChatGPT, Claude, Gemini — fill or change the tracker. Copy the instructions, paste them into the chat and write what you want. Then copy its answer and paste it here: you see every change before it is saved.'),
      h('div', { class: 'stack' },
        pillButton('copy', 'Copy instructions', () => copyPrompt(false), 'pill-wide'),
        pillButton('copy', 'Copy with my data', () => copyPrompt(true), 'pill-wide'),
        pillButton('plus', 'Paste AI answer', () => pasteSheet(true), 'is-on pill-wide')),
      h('p', { class: 'setting-hint' },
        'Without data the AI can only add. With my data it also sees open tasks, spheres and goals, so it can complete, move or delete them. The data goes only to the chat you paste it into.')),

    h('h2', { class: 'label' }, 'Data'),
    h('section', { class: 'block-alt' },
      h('p', { class: 'block-text' }, 'Everything lives on this device only. Nothing is sent anywhere. Export a backup now and then — it is also how you move to a new phone. Attachments are included.'),
      h('div', { class: 'stack' },
        pillButton('download', 'Export backup', exportBackup, 'is-on pill-wide'),
        pillButton('upload', 'Import from file', () => picker.click(), 'pill-wide'),
        pillButton('plus', 'Paste a list', () => pasteSheet(false), 'pill-wide'),
        picker),
      h('p', { class: 'setting-hint' },
        'Files: backup, JSON, CSV (columns title, sphere, status, priority, deadline, day, note), text or Markdown. ',
        'In a list, @today or @2026-10-01 plans the day, due:2026-10-05 sets a deadline, ! marks high priority.')),

    h('p', { class: 'version' }, `Version ${VERSION}`),
    // кредит шрифта: лицензия OFL его не требует, но автору — спасибо
    h('p', { class: 'credit' }, 'Typeface: Geist by The Geist Project Authors (Vercel), SIL Open Font License 1.1.'));
}
