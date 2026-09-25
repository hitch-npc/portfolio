/**
 * Временная проверка вибрации: какой из способов iPhone отрабатывает.
 * A — как в приложении (ui.js haptic); B, C — переключатель нарисован на
 * странице; D — настоящий, по нему тапают пальцем; E — Vibration API.
 */
const log = document.getElementById('log');
const note = (text) => { log.textContent = `${new Date().toLocaleTimeString()} — ${text}`; };

function switchLabel(cls) {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  if (cls) label.className = cls;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.append(input);
  return label;
}

// C: переключатель живёт на странице всё время
const permanent = switchLabel('ghost');
document.body.append(permanent);

const tests = {
  a() {
    const label = switchLabel();
    document.head.append(label);
    label.click();
    label.remove();
  },
  b() {
    const label = switchLabel('ghost');
    document.body.append(label);
    label.click();
    label.remove();
  },
  c() {
    permanent.querySelector('input').click();
  },
  e() {
    if (!('vibrate' in navigator)) return 'no navigator.vibrate here';
    return navigator.vibrate(30) ? 'vibrate() returned true' : 'vibrate() returned false';
  },
};

for (const btn of document.querySelectorAll('[data-test]')) {
  btn.addEventListener('click', () => {
    const k = btn.dataset.test;
    try {
      note(`${k.toUpperCase()}: ${tests[k]() ?? 'fired'}`);
    } catch (err) {
      note(`${k.toUpperCase()}: error ${err.name}`);
    }
  });
}

document.querySelector('.real input').addEventListener('change', () => note('D: toggled'));

const ios = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
document.getElementById('info').textContent = [
  ios ? `UA says iOS ${ios[1]}.${ios[2]}` : 'not iOS?',
  standalone ? 'home screen app' : 'browser tab',
  `switch: ${'switch' in HTMLInputElement.prototype ? 'yes' : 'no'}`,
  `vibrate: ${'vibrate' in navigator ? 'yes' : 'no'}`,
].join(' · ');
