# TBCS™ — portfolio

Портфолио Eldar Swartz (The Black Cat Studio). Одна страница: знак на холсте,
блок навыков-зрачка, заставка перехода и кейс дизайн-системы TTS.

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
```

Деплой — GitHub Actions (`.github/workflows/pages.yml`) на GitHub Pages.
