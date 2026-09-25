/**
 * Временная проверка вибрации, раунд 2. Раунд 1 на iOS 27: вибрирует
 * только переключатель, по которому тапнули пальцем; щелчок из кода
 * (label.click, input.click) и navigator.vibrate — нет. Здесь — можно ли
 * спрятать переключатель под кнопку так, чтобы вибрация осталась:
 * 1 — видимый (контроль), 2 — невидимый поверх карточки, 3 — внутри
 * label, 4 — label for= на переключатель в другом месте, 5 — display: none,
 * 6 — провести пальцем по невидимому (для крутилки: вибрирует ли при движении).
 */
const log = document.getElementById('log');

const times = {};
for (const input of document.querySelectorAll('[data-log]')) {
  input.addEventListener('change', () => {
    const k = input.dataset.log;
    times[k] = (times[k] ?? 0) + 1;
    log.textContent = `${new Date().toLocaleTimeString()} — ${k}: switch toggled (${times[k]}×)`;
  });
}

const ios = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
document.getElementById('info').textContent = [
  ios ? `UA says iOS ${ios[1]}.${ios[2]}` : 'not iOS?',
  standalone ? 'home screen app' : 'browser tab',
  `switch: ${'switch' in HTMLInputElement.prototype ? 'yes' : 'no'}`,
].join(' · ');
