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
export const fmtLong = (s) => `${fmtShort(s)} ${s.slice(0, 4)}`; // 24 Sep 2026

/** Ближайший понедельник после `s` (с понедельника — через неделю). */
export function nextWeek(s) {
  const wd = parse(s).getDay();
  return addDays(s, (8 - wd) % 7 || 7);
}

/** Подпись запланированного дня: Today, Tomorrow, день недели в пределах недели, иначе дата. */
export function dayLabel(day, today) {
  const d = diffDays(today, day);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return fmtWeekday(day);
  return day.slice(0, 4) === today.slice(0, 4) ? fmtDay(day) : fmtLong(day);
}

/**
 * Следующий день повторяющейся задачи. Месяц вперёд с 31-го — последний день
 * следующего месяца, а не перескок через него.
 */
/** Через n месяцев, тем же числом; 31 января + 1 → 28 (29) февраля. */
export function addMonths(day, n) {
  const d = parse(day);
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return iso(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}

export function nextRepeat(day, repeat) {
  if (repeat === 'daily') return addDays(day, 1);
  if (repeat === 'weekly') return addDays(day, 7);
  if (repeat === 'weekdays') {
    const wd = parse(day).getDay();
    return addDays(day, wd === 5 ? 3 : wd === 6 ? 2 : 1);
  }
  if (repeat === 'monthly') return addMonths(day, 1);
  return null;
}

/** Подпись дедлайна относительно дня `day`: { text, late } */
export function dueLabel(deadline, day) {
  const d = diffDays(day, deadline);
  if (d < 0) return { text: `Overdue ${-d}d`, late: true };
  if (d === 0) return { text: 'Due today', late: false };
  if (d === 1) return { text: 'Due tomorrow', late: false };
  if (d < 7) return { text: `Due ${fmtWeekday(deadline)}`, late: false };
  return { text: `Due ${fmtShort(deadline)}`, late: false };
}
