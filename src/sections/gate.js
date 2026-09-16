/**
 * Переход к кейсу: заставка дешифруется, ждёт нажатия, теряет сигнал
 * и выключается, как экран. После этого открывается обложка кейса.
 *
 * Заставка — не препятствие: если её пролистали без нажатия, кейс всё равно
 * ниже и открыт. Нажатие только доигрывает выключение и подводит к обложке.
 */
import { decrypt, scramble } from './decrypt.js';

export class Gate {
  /**
   * @param {HTMLElement} root секция-заставка
   * @param {HTMLElement} target обложка кейса, к которой ведём
   * @param {() => void} [onExit] зовётся в начале выхода: плёнка гаснет вместе с сигналом
   */
  constructor(root, target, onExit) {
    this.root = root;
    this.target = target;
    this.onExit = onExit;
    this.title = root.querySelector('[data-gate-title]');
    this.stats = root.querySelector('[data-gate-stats]');
    this.cue = root.querySelector('[data-gate-go]');
    this.screen = root.querySelector('[data-gate-screen]');

    this.titleText = this.title.textContent.trim();
    this.statsText = this.stats.textContent.trim();
    this.played = false;
    this.spent = false;
    // номер текущего прогона. Вступление, выход и возврат — асинхронные и могут
    // перекрыться: нажатие до конца дешифровки, прокрутка назад посреди выхода.
    // Каждый шаг после await сверяет номер и молча сходит, если его обогнали
    this.run = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.reduced) {
      this.title.textContent = '';
      this.stats.textContent = '';
    }

    this.cue.addEventListener('click', () => this.exit());

    // Наблюдатель живёт всё время: вверх по странице заставка возвращается
    // и заводится заново. Иначе после одного нажатия на её месте остаётся дыра.
    this.io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      if (this.spent) this.rearm();
      else this.intro();
    }, { threshold: 0.45 });
    this.io.observe(root);
  }

  async intro() {
    if (this.played) return;
    this.played = true;
    const run = ++this.run;
    const alive = () => run === this.run;

    await decrypt(this.title, this.titleText, { stagger: 38, alive });
    if (!alive()) return;
    await decrypt(this.stats, this.statsText, { stagger: 16, alive });
    if (!alive()) return;
    this.cue.classList.add('is-in');
  }

  /** Возврат: экран включается обратно и снова ждёт нажатия. */
  rearm() {
    this.run++;
    this.spent = false;
    this.played = false;
    this.cue.disabled = false;
    this.cue.classList.remove('is-in');
    this.screen.classList.remove('is-off', 'is-lost');
    this.root.classList.remove('is-spent');
    this.intro();
  }

  /** Потеря сигнала, выключение экрана, выход к обложке. */
  async exit() {
    if (this.spent) return;
    this.spent = true;
    this.cue.disabled = true;
    const run = ++this.run;
    this.onExit?.();

    if (this.reduced) {
      this.target.scrollIntoView({ block: 'start' });
      return;
    }

    this.screen.classList.add('is-lost');
    await Promise.all([scramble(this.title, 380), scramble(this.stats, 300)]);
    if (run !== this.run) return;

    this.screen.classList.remove('is-lost');
    this.screen.classList.add('is-off');
    await new Promise((r) => setTimeout(r, 420));
    if (run !== this.run) return;

    this.root.classList.add('is-spent');
    this.target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
