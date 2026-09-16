# TBCS™ — portfolio

Портфолио Eldar Swartz (The Black Cat Studio). Одна страница: знак на холсте,
блок навыков со зрачком и колода кейсов. Карта раскрывается в окно с кейсом:
первый — дизайн-система TTS, второй (брендинг) пока заглушка.

## Правила, которые держит сборка

- `tokens.json` — единственный источник значений, `src/styles/tokens.css` генерируется;
- страж (`tooling/guardrail.mjs`) валит сборку на сыром `#hex` вне `:root`,
  `border-radius` больше 8px, движении без `prefers-reduced-motion`
  и снятом `outline` без `:focus-visible`;
- кейс TTS показывается своим дизайном: ядро и демонстрации переносятся
  из `vendor/tts` (DS TTS R14) и уводятся под `.tts` — портфолио остаётся
  на своих токенах.

## Команды

```
npm run dev      # сборка токенов + ядра кейса, затем vite
npm run check    # сверка tokens.css с tokens.json + страж
npm run build    # сборка в один файл: dist/index.html
npm run fetch:fonts  # один раз на смену набора: шрифты с Google → public/fonts
```

Шрифты лежат на сайте (`public/fonts`, лицензии OFL рядом): браузер зрителя
к Google не ходит. Политика CSP в сборке разрешает только свой домен.

Gambarino и Switzer (Fontshare, ITF FFL 2.0) в репозиторий не входят: лицензия
разрешает держать их на своём сайте, но не в публичном хранилище. `npm run dev`
и `npm run build` скачивают их сами (`tooling/fetch-fontshare.mjs`) в
`public/fonts/fontshare/`, эта папка в `.gitignore`.

Деплой — GitHub Actions (`.github/workflows/pages.yml`) на GitHub Pages.
