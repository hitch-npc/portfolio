/**
 * Общий кадр прокрутки.
 *
 * Каждый блок сайта на прокрутке делает одно и то же: читает своё положение
 * и раскладывает его по CSS-переменным. Поодиночке это безобидно, вместе —
 * нет: запись переменной пачкает вёрстку, а следующее чтение геометрии в том
 * же кадре заставляет браузер пересчитать её заново, посреди кадра. Чем
 * больше блоков, тем дороже — и платит всегда тот, кто читает первым.
 *
 * Поэтому чтения и записи разведены по фазам: сначала опрашиваются все
 * читатели (вёрстка на этот момент уже посчитана браузером, и чтение
 * бесплатно), потом выполняются все записи (их до конца кадра никто не
 * прочитает). Один слушатель прокрутки и один requestAnimationFrame на всех.
 *
 * Замер на витрине: 113 мс принудительных пересчётов за 3 секунды прокрутки
 * до разведения фаз — и единицы миллисекунд после.
 */

const tasks = [];
let queued = false;
let bound = false;

function run() {
  queued = false;
  // фаза чтения
  for (const task of tasks) task.state = task.read ? task.read() : null;
  // фаза записи
  for (const task of tasks) task.write(task.state);
}

/**
 * Просит кадр. Несколько просьб подряд сливаются в один. Звать может любой
 * ввод, не только прокрутка: курсор тоже двигает свет (see rays.js).
 */
export function requestFrame() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

/**
 * Подписывает блок на кадр прокрутки.
 * @param {(() => unknown) | null} read чтение геометрии; null — блоку нечего читать
 * @param {(state: unknown) => void} write раскладка прочитанного по стилям
 * @returns {() => void} отписка
 */
export function onScrollFrame(read, write) {
  const task = { read, write, state: null };
  tasks.push(task);

  if (!bound) {
    bound = true;
    addEventListener('scroll', requestFrame, { passive: true });
    addEventListener('resize', requestFrame);
  }

  requestFrame();
  return () => {
    const i = tasks.indexOf(task);
    if (i >= 0) tasks.splice(i, 1);
  };
}
