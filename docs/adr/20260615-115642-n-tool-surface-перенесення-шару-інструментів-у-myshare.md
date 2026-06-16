---
session: 40c9af33-c316-4040-bee4-ad2281ad7565
captured: 2026-06-15T11:56:43+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/40c9af33-c316-4040-bee4-ad2281ad7565.jsonl
---

## ADR n-tool-surface: перенесення шару інструментів у myshare

## Context and Problem Statement

У myshare дії над посиланнями (`youtube.js`, `page-meta.js`, `omlx.js`) розкидані по компонентах і викликаються inline у `App.vue`. Відсутній єдиний механізм, щоб LLM-агент і UI зверталися до однієї реалізації через уніфікований конверт зі схемою.

## Considered Options

* Перенести паттерн `n-tool-surface` з `nitra/task` (catalog + dispatch + manifest + scope) у `myshare`, адаптувавши під один WebView-рантайм
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Перенести n-tool-surface у myshare без CLI-транспорту", because myshare має лише один рантайм (WebView) і CLI-транспорт (`bin/task.mjs` / spawn бінарника) не потрібен; Tauri-invoke та LLM-HTTP покривають усі потрібні споживачі.

### Consequences

* Good, because transcript фіксує очікувану користь: UI і LLM-агент звертаються до однієї реалізації в `catalog.js`; логіка не дублюється.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

Файли: `app/src/tool/catalog.js`, `app/src/tool/dispatch.js`, `app/src/tool/manifest.js`, `app/src/tool/scope.js`, `app/src/tool/llm.js`, `app/src/tool/index.js`. Тести: `app/src/tool/tool.test.js`, `app/src/tool/llm.test.js` — 126/126 green. Build: `bunx vite build` — 128 modules, успішно.

---

## ADR Platform-aware LLM: LiteRT-LM + Gemma4-E2B на Android, omlx на desktop

## Context and Problem Statement

myshare підтримує два рантайми: desktop (Apple Silicon, локальний MLX-сервер omlx на `:8000`) і Android (мобільний пристрій без доступу до desktop-сервера). Потрібен різний LLM-адаптер залежно від платформи.

## Considered Options

* `selectChat` обирає між `createOpenAiChat` (omlx HTTP) і `createLiteRtChat` (on-device через Tauri-команду `litert_chat`) залежно від `isAndroidPlatform()`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "`selectChat` з platform-aware розгалуженням", because користувач явно зазначив: на мобільному використовувати LiteRT-LM з Gemma4-E2B, CLI-транспорт не потрібен.

### Consequences

* Good, because transcript фіксує очікувану користь: той самий `runAgent` loop працює на обох платформах без змін на call-site.
* Bad, because Rust-команда `litert_chat` і бандлинг LiteRT-LM/Gemma4-E2B — окремий крок; наразі `createLiteRtChat` є JS-шим (виклики reject'аються до реалізації команди).

## More Information

Реалізація: `app/src/tool/llm.js` — функції `createOpenAiChat`, `createLiteRtChat`, `selectChat`. Платформа визначається через `isAndroidPlatform()` з `platform.js`. Модель за замовчуванням у `createLiteRtChat`: `'gemma4-e2b'`. Tauri-команда `litert_chat` — не реалізована на момент запису ADR.

---

## ADR ctx у dispatch для UI-афордансів та міграція App.vue

## Context and Problem Statement

`dispatch(name, input)` повертає уніфікований конверт `{ok, output}`, але `translateToUkrainian` у `App.vue` вимагає callback `onProgress` для відображення прогресу по чанках — це UI-афорданс, не частина JSON-схеми інструмента. Без окремого параметра міграція `App.vue` на `dispatch` втратила б прогрес-бар або потребувала б зміни схеми.

## Considered Options

* Додати опціональний третій параметр `ctx` до `dispatch(name, input, ctx)` та `guardDispatch`, який прокидається в `tool.run(input, ctx)` без валідації
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Необов'язковий `ctx` у dispatch", because це дозволяє передавати `{onProgress, signal}` без включення їх у JSON-схему (схема описує дані, не UI-колбеки); `App.vue` мігрує на `dispatch` без втрати прогрес-функціональності.

### Consequences

* Good, because transcript фіксує очікувану користь: `App.vue` повністю переведений на `dispatch`; чотири call-site'и (`page_meta`, `languages`, `transcript`, `translate`) не звертаються напряму до `youtube.js`/`page-meta.js`/`omlx.js` — паритет між UI і LLM через одну реалізацію підтверджено.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

Файли: `app/src/tool/dispatch.js` (сигнатура `createDispatch(transport)`, `dispatch(name, input, ctx)`), `app/src/tool/scope.js` (`guardDispatch(dispatch, actor)` прокидає `ctx`), `app/src/App.vue` (мігровано; видалено прямі імпорти `fetchPageMeta`, `getYoutubeTranscript`, `getYoutubeLanguages`, `translateToUkrainian`). Перевірка: `bunx vite build` — 128 modules, успішно; 126/126 тестів green.
