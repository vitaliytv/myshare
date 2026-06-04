---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-03T13:42:52+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

## ADR Відображення статусу субтитрів через поле `availableLangs` supadata

## Context and Problem Statement
Застосунок `myshare` показував кнопку «Субтитри» для кожного YouTube-посилання, але наявність мов (uk/en) можна було дізнатись лише після тапу кнопки — тобто після повного фетчу транскрипту. Потрібно було відображати статус субтитрів (🇺🇦 UA / 🇬🇧 EN / «Без UA·EN») одразу, без зайвих запитів до supadata API.

## Considered Options
* Один запит до `/youtube/transcript` без параметра `lang` — supadata повертає `availableLangs` у будь-якій відповіді (навіть без тексту); цього достатньо для визначення доступних мов.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Один запит до `/youtube/transcript` без `lang` для отримання `availableLangs`", because supadata повертає поле `availableLangs` у тілі будь-якої transcript-відповіді, що дозволяє визначити всі доступні мови субтитрів одним запитом, не тягнучи весь текст.

### Consequences
* Good, because transcript фіксує очікувану користь: статус видно одразу по кожному лінку, без тапу; `captionStatus()` нормалізує `uk-UA`/`en-US` і визначає пріоритет (uk → en → none).
* Bad, because кожен новий YouTube-лінк коштує 1 запит supadata (free tier — 100/місяць). Компенсується кешем у `localStorage` (модуль `caption-langs.js`) — повторні відкриття того ж `videoId` безкоштовні.

## More Information
Нова Tauri-команда `yt_list_languages(video_id)` у `app/src-tauri/src/youtube.rs`; зареєстрована в `app/src-tauri/src/lib.rs`. JS-обгортка `getYoutubeLanguages` у `app/src/youtube.js`. Чиста логіка й кеш — `app/src/caption-langs.js`. Документація supadata: `availableLangs` присутній у відповіді `GET /youtube/transcript`.

---

## ADR Переклад субтитрів EN→UA через локальний Ollama (десктоп-only, без окремої Rust-команди)

## Context and Problem Statement
Коли для YouTube-відео є лише англійські субтитри, користувачу потрібна можливість отримати їх українською. Потрібно було обрати між хмарним перекладачем та локальним LLM, а також спосіб HTTP-виклику в межах Tauri-застосунку.

## Considered Options
* Локальний Ollama через `tauri-plugin-http` напряму з JS (як `page-meta.js`) — без нової Rust-команди, `POST http://localhost:11434/api/chat`.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Локальний Ollama через `tauri-plugin-http` з JS", because підхід аналогічний вже наявному `page-meta.js`; не потрібно додавати нову Tauri-команду в Rust; Ollama вже встановлений і локально доступний; хмарний переклад потребував би квоти або платного API.

### Consequences
* Good, because transcript фіксує очікувану користь: переклад не залежить від зовнішніх квот, дані не залишають пристрій; код лишається в JS-шарі (`app/src/ollama.js`).
* Bad, because функція доступна тільки на desktop/Mac (Ollama не є мобільним рішенням); вимагає, щоб Ollama-сервер був запущений (`ollama serve`); при 16 GB RAM і важкій моделі може спричинити тиск на пам'ять.

## More Information
Новий файл `app/src/ollama.js`: `chunkText` (≤3500 символів, по межах абзаців), `translateToUkrainian({onProgress})`, `resolveModel` (`GET /api/tags`). Необхідно додати до `app/src-tauri/capabilities/default.json` явні дозволи `http://localhost:11434/*` і `http://127.0.0.1:11434/*` — без них Tauri HTTP-scope відхиляє запити за явним портом.

---

## ADR Вибір `gemma3:4b` як дефолтної моделі Ollama для перекладу субтитрів

## Context and Problem Statement
Початково застосунок використовував `gemma4:e4b` (9.6 GB у RAM, 8B параметрів, Q4_K_M). На Mac M5 з 16 GB unified RAM це призводило до заповнення свопу (до 16 GB used), тотального гальмування системи і сповільнення перекладу. Потрібно було обрати модель, яка дає прийнятну якість перекладу без своп-трешингу.

## Considered Options
* `gemma3:4b` — ~3.3 GB на диску, ~4.4 GB у RAM, 37–39 tok/s на M5.
* `gemma4:e4b` — ~9.6 GB у RAM, 28 tok/s; найвища якість, але спричиняла своп.
* `gemma3:1b` — 101 tok/s, зациклювалась під час перекладу (нескінченний цикл).
* `qwen3:1.7b`, `qwen3:4b` — reasoning-режим не вимикається в ollama (`think:false` ігнорується), виводили англійські міркування замість перекладу.
* `mistral:7b`, `ministral-3:3b`, `ministral-3:8b` — нижча якість або повільніший load.

## Decision Outcome
Chosen option: "`gemma3:4b`", because бенчмарк на реальних субтитрах (Rick Astley, 2089 символів) показав другу за якістю природну українську мову після `gemma4:e4b`, але утричі менший footprint (4.4 GB vs 9.6 GB) — влазить у RAM без свопу навіть при відкритих IDE та браузері.

### Consequences
* Good, because transcript фіксує очікувану користь: 37 tok/s, load 1.7s, весь текст за ~14s; система не гальмує; кнопка «Перекласти» стає практично використовуваною на 16 GB Mac.
* Bad, because `gemma4:e4b` дає вищу якість перекладу (точніші ідіоми, менше кальок); обрана модель має дрібні огріхи у відмінювані дієслів.

## More Information
Константа `DEFAULT_MODEL = 'gemma3:4b'` у `app/src/ollama.js`. Бенчмарк проводився скриптом `/tmp/bench.py` на 9 моделях: `gemma3:1b`, `qwen3:1.7b`, `ministral-3:3b`, `qwen3:4b`, `gemma3:4b`, `mistral:7b`, `ministral-3:8b`, `gemma4:e2b`, `gemma4:e4b`. Функція `resolveModel` відкочується на першу наявну модель, якщо `DEFAULT_MODEL` не встановлена.

---

## ADR Параметри інференсу Ollama: `num_ctx: 8192` та `keep_alive: '5m'`

## Context and Problem Statement
Потрібно було визначити KV-кеш-розмір (`num_ctx`) і час утримання моделі в пам'яті (`keep_alive`). Початково код не задавав `num_ctx` (дефолт моделі — до 131072 токенів), а після першої ітерації `keep_alive` встановили `0` (негайне вивантаження). Користувач попросив повернути `keep_alive` до 5 хвилин.

## Considered Options
* `num_ctx: 8192` + `keep_alive: '5m'` — компактний KV-кеш, модель не вивантажується між чанками одного перекладу.
* `num_ctx: 8192` + `keep_alive: 0` — негайне вивантаження після кожного чанка; вивільняє RAM одразу, але перевантажує модель повторно при перекладі наступного чанка.
* Без явного `num_ctx` (дефолт моделі) — роздутий KV-кеш, зайвий тиск на RAM.

## Decision Outcome
Chosen option: "`num_ctx: 8192` + `keep_alive: '5m'`", because чанки ≤3500 символів (~1200 токенів) плюс переклад зручно вміщуються у 8192 токенів із запасом; 5 хвилин утримання дозволяє перекладати кілька чанків одного відео або кілька відео підряд без повторного завантаження моделі.

### Consequences
* Good, because transcript фіксує очікувану користь: швидший послідовний переклад (модель не вивантажується між чанками); менший KV-кеш знижує RAM-тиск порівняно з дефолтним контекстом.
* Bad, because після останнього перекладу модель ще 5 хв займає ~4.4 GB RAM (замість звільнення одразу). Прийнятний компроміс на тлі виграшу в швидкості.

## More Information
Параметри передаються в `options` тіла `POST /api/chat` у функції `translateChunk` (`app/src/ollama.js`). Документація: `num_ctx` — кількість токенів контексту для KV-кешу; `keep_alive` — час утримання завантаженої моделі після останнього запиту.
