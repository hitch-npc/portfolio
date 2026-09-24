/**
 * Вложения задачи: фото, PDF, документы. Файл копируется в базу на
 * устройстве и никуда не уходит. Картинки видны миниатюрой, остальное —
 * значком с именем; тап открывает просмотр: открыть, поделиться, удалить.
 */
import { h, icon, openSheet, closeSheet, renderSheet, toast } from '../ui.js';
import * as store from '../store.js';
import { ui } from './common.js';

/** Больше — уже не вложение к задаче, а архив: копия раздувается, телефон тормозит. */
const MAX_SIZE = 25 * 1024 * 1024;

/* адрес blob: на файл — один на файл, пока он есть */
const urls = new Map();

function urlOf(f) {
  if (!urls.has(f.id)) urls.set(f.id, URL.createObjectURL(f.blob));
  return urls.get(f.id);
}

function forget(id) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}

const isImage = (f) => /^image\//.test(f.type);

export function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function attach(taskId, list) {
  const files = [...list];
  const big = files.filter((f) => f.size > MAX_SIZE);
  const ok = files.filter((f) => f.size <= MAX_SIZE);
  if (big.length) toast(`${big[0].name} is over 25 MB — not attached`);
  if (!ok.length) return;
  try {
    await store.addFiles(taskId, ok);
    if (!big.length) toast(ok.length === 1 ? 'File attached' : `${ok.length} files attached`);
  } catch (err) {
    console.error(err);
    toast('Could not save the file — check storage space');
  }
}

async function share(f) {
  const file = new File([f.blob], f.name, { type: f.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: f.name });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Could not share');
    }
    return;
  }
  // без «Поделиться» — скачивание
  const a = h('a', { href: urlOf(f), download: f.name });
  document.body.append(a);
  a.click();
  a.remove();
}

function preview(id) {
  ui.confirm = null;
  openSheet(() => {
    const f = store.getState().files.find((x) => x.id === id);
    if (!f) return [];
    const confirming = ui.confirm === `file-${id}`;
    return [
      h('h2', { class: 'sheet-file-name' }, f.name),
      h('p', { class: 'sheet-text muted' }, `${fmtSize(f.size)}${f.type ? ` · ${f.type}` : ''}`),
      isImage(f)
        ? h('img', { class: 'preview-img', src: urlOf(f), alt: f.name })
        : h('div', { class: 'preview-file' }, icon('file')),
      h('div', { class: 'sheet-actions' },
        h('a', { class: 'pill pill-action', href: urlOf(f), target: '_blank', rel: 'noopener' }, 'Open'),
        h('button', { class: 'pill pill-action', type: 'button', onclick: () => share(f) }, 'Share'),
        h('button', {
          class: ['pill', 'pill-action', confirming && 'is-on'], type: 'button',
          onclick: () => {
            if (!confirming) {
              ui.confirm = `file-${id}`;
              renderSheet();
              return;
            }
            ui.confirm = null;
            closeSheet();
            forget(id);
            store.deleteFile(id);
            toast('File removed');
          },
        }, confirming ? 'Sure?' : 'Delete')),
    ];
  });
}

/** Поле «Files» в карточке задачи: вложения и кнопка «прикрепить». */
export function filesField(t) {
  const files = store.filesOf(t.id);
  const picker = h('input', {
    class: 'offscreen', type: 'file', multiple: true, tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => {
      const list = [...e.target.files];
      e.target.value = '';
      if (list.length) attach(t.id, list);
    },
  });
  return [
    files.length > 0 && h('ul', { class: 'files' }, files.map((f) =>
      h('li', null, h('button', { class: 'file', type: 'button', onclick: () => preview(f.id) },
        isImage(f)
          ? h('img', { class: 'file-thumb', src: urlOf(f), alt: '' })
          : h('span', { class: 'file-thumb' }, icon('file')),
        h('span', { class: 'file-name' }, f.name),
        h('span', { class: 'file-size' }, fmtSize(f.size)))))),
    h('button', { class: 'pill', type: 'button', onclick: () => picker.click() }, icon('clip', 20), 'Attach'),
    picker,
  ];
}
