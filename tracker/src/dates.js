/**
 * Даты хранятся строками 'YYYY-MM-DD' в местном времени: дедлайн и «на сегодня» —
 * это день в календаре, а не момент. Часовой пояс и переход на летнее время
 * так до них не доходят.
 */
const pad = (n) => String(n).padStart(2, '0');

export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (now = new Date()) => iso(now);

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** b − a в днях; round гасит час, который съедает или добавляет переход на летнее время */
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export const monthOf = (s) => s.slice(0, 7);

/* Названия свои, а не из Intl: движки расходятся в мелочах («Sept», запятая
   после дня недели), а подписи должны быть одинаковыми на телефоне и в тестах. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const fmtWeekday = (s) => WEEKDAYS[parse(s).getDay()]; // Thu
export const fmtShort = (s) => `${parse(s).getDate()} ${MONTHS[parse(s).getMonth()]}`; // 24 Sep
export const fmtDay = (s) => `${fmtWeekday(s)} ${fmtShort(s)}`; // Thu 24 Sep
export const fmtMonth = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`; // September 2026
export const monthName = (ym) => MONTHS_LONG[Number(ym.slice(5, 7)) - 1]; // September

/** Подпись дедлайна относительно дня `day`: { text, late } */
export function dueLabel(deadline, day) {
  const d = diffDays(day, deadline);
  if (d < 0) return { text: `Overdue ${-d}d`, late: true };
  if (d === 0) return { text: 'Due today', late: false };
  if (d === 1) return { text: 'Due tomorrow', late: false };
  if (d < 7) return { text: `Due ${fmtWeekday(deadline)}`, late: false };
  return { text: `Due ${fmtShort(deadline)}`, late: false };
}
