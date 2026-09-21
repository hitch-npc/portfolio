/**
 * Архив постеров: что лежит в папке, то и в кольце.
 *
 * Устройство папки src/posters:
 *
 *   01-pottery-space.jpg     обложка — она же карточка в кольце
 *   pottery-space/           всё остальное по этому проекту (необязательно)
 *       01.jpg  02.gif  03.mp4
 *   meta.json                тексты: заголовок, теги, год, клиент, описание
 *
 * Имя обложки — «номер-имя»: номер задаёт порядок в кольце, имя связывает
 * обложку с папкой материалов и с ключом в meta.json. Переставить постеры —
 * значит поменять номера; папку и meta.json трогать не нужно.
 *
 * Ничего из этого не обязательно: без папки карточка покажет одну обложку,
 * без записи в meta.json — заголовок из имени файла. Поэтому положить новый
 * постер можно и не заполняя ничего (npm run posters -- <файл>), а тексты
 * дописать потом.
 */
import meta from '../posters/meta.json';

const covers = import.meta.glob('../posters/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// материалы проекта: на уровень глубже, в папке с именем постера
const extras = import.meta.glob('../posters/*/*.{jpg,jpeg,png,webp,avif,gif,mp4,webm}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const VIDEO = /\.(mp4|webm)$/i;

/** «../posters/03-nature-ceramics.jpg» → «nature-ceramics» */
const slugOf = (path) => path.split('/').pop().replace(/^\d+[-_]/, '').replace(/\.[^.]+$/, '');

/** «nature-ceramics» → «Nature Ceramics»: запасной заголовок, если meta молчит */
const titleOf = (slug) => slug.replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const byFolder = new Map();
for (const path of Object.keys(extras).sort()) {
  const folder = path.split('/').at(-2);
  if (!byFolder.has(folder)) byFolder.set(folder, []);
  byFolder.get(folder).push({
    src: extras[path],
    type: VIDEO.test(path) ? 'video' : 'image',
  });
}

const order = Object.keys(covers).sort();

export const POSTERS = order.map((path, i) => {
  const slug = slugOf(path);
  const m = meta[slug] ?? {};
  return {
    slug,
    index: i + 1,
    total: order.length,
    src: covers[path],
    title: m.title || titleOf(slug),
    kind: m.kind ?? [],
    year: m.year ?? '',
    client: m.client ?? '',
    role: m.role ?? '',
    note: m.note ?? '',
    facts: m.facts ?? {},
    media: byFolder.get(slug) ?? [],
  };
});
