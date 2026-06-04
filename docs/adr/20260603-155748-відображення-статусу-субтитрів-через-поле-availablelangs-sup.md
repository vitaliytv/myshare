---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-03T15:57:48+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

## ADR Відображення статусу субтитрів через поле `availableLangs` supadata

## Context and Problem Statement
Потрібно показувати по кожному YouTube-лінку, чи є субтитри українською або англійською, одразу при завантаженні списку — не після тапу на кнопку. Питання: звідки брати список доступних мов без надмірних витрат квоти supadata.

## Considered Options
* Окремий metadata-endpoint supadata для отримання списку мов
* Один запит до transcript-endpoint, що повертає `availableLangs` у будь-якій відповіді
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Один запит до transcript-endpoint із полем `availableLangs`", because supadata повертає `availableLangs` (повний список мов) у будь-якій відповіді `/youtube/transcript`, тому окремого metadata-endpoint не потрібно — один запит на відео дає всю інформацію про наявність мов без завантаження повного тексту.

### Consequences
* Good, because transcript фіксує очікувану користь: `yt_list_languages` отримує лише мінімальний payload (без `lang`, `text=true`), не тягнучи весь транскрипт.
* Bad, because кожна нова перевірка коштує 1 запит supadata (free tier 100/міс); вирішено кешуванням у `localStorage` за `videoId` (`app/src/caption-langs.js`, ключ `STORAGE_KEY`).

## More Information
- Нова Rust-команда: `yt_list_languages(video_id)` у `app/src-tauri/src/youtube.rs`, зареєстрована в `app/src-tauri/src/lib.rs`.
- JS-обгортка: `getYoutubeLanguages(videoId)` у `app/src/youtube.js`.
- Кеш мов: `app/src/caption-langs.js` — `captionStatus()`, `loadLangsCache`, `saveLangsCache`.
- Статус відображається як чіп: 🇺🇦 UA / 🇬🇧 EN / «Без UA·EN» (з tooltip доступних мов).

---

## ADR Переклад субтитрів через `tauri-plugin-http` напряму з JS (без нової Rust-команди)

## Context and Problem Statement
Потрібно реалізувати EN→UA переклад субтитрів через локальний Ollama (`http://localhost:11434`) на desktop/Mac. Питання: де жити логіці HTTP-запиту — у Rust (нова Tauri-команда) чи у JS через `tauri-plugin-http`.

## Considered Options
* Нова Rust-команда, яка звертається до Ollama
* `fetch` з `@tauri-apps/plugin-http` напряму з JS (як у `page-meta.js`)

## Decision Outcome
Chosen option: "`fetch` з `@tauri-apps/plugin-http` напряму з JS", because Ollama є локальним сервісом (localhost), а в проєкті вже є прецедент такого патерну у `app/src/page-meta.js`; нова Rust-команда нічого не додає.

### Consequences
* Good, because transcript фіксує очікувану користь: менше Rust-коду, логіка перекладу (чанкінг, retry, progress-callback) реалізується в JS без перекомпіляції Rust.
* Bad, because `http://**` wildcard у Tauri capabilities не матчить явний порт `:11434` — виявлено в runtime; виправлено додаванням явних `http://localhost:11434/*` і `http://127.0.0.1:11434/*` до `app/src-tauri/capabilities/default.json`.

## More Information
- Модуль перекладу: `app/src/ollama.js` — `chunkText` (≤3500 симв.), `buildMessages`, `translateChunk` (`POST /api/chat`, `stream:false`, `temperature:0.2`), `translateToUkrainian({onProgress})`, `resolveModel` (`/api/tags`).
- Кеш перекладів: `app/src/translation-cache.js` → `localStorage` за `videoId`.
- Діалог порівняння: двоколонкова сітка оригінал (EN) / переклад (UA) по сегментах у `App.vue`.
- Фіча доступна лише на desktop (`canTranslate = !isAndroidPlatform()`).

---

## ADR Вибір дефолт-моделі Ollama: `gemma3:4b` замість `gemma4:e4b`

## Context and Problem Statement
Перший запуск перекладу через `gemma4:e4b` (9.6 GB) на Mac з 16 GB RAM призвів до swap-трешингу (`swap used = 16 GB`, 1.6M pageouts) і повного зависання системи. Потрібно вибрати дефолт-модель, яка дає прийнятну якість без переповнення RAM.

## Considered Options
* `gemma4:e4b` (8.0B параметрів, Q4_K_M, ~9.6 GB RAM)
* `gemma3:4b` (~3.3 GB RAM, 37 tok/s)
* `gemma3:1b`, `qwen3:1.7b` — зациклювались або не перекладали
* `qwen3:4b` — reasoning не вимикається (`think:false` ігнорується в ollama), модель виводила англійські роздуми замість перекладу
* `ministral-3:8b`, `ministral-3:3b`, `mistral:7b`, `aya-expanse:8b`, `aya:8b`, `command-r7b` — тестувались у бенчмарку

## Decision Outcome
Chosen option: "`gemma3:4b`", because бенчмарк на 9+ моделях показав, що `gemma3:4b` дає другу за якістю українську (після `gemma4:e4b`) при розмірі 3.3 GB — вкладається в 16 GB без свопу, load 1.7s, ~37 tok/s, повний текст субтитрів за ~14 секунди.

### Consequences
* Good, because transcript фіксує очікувану користь: `gemma3:4b` у RAM займає 3.3–4.4 GB (підтверджено `ollama ps`: 4.4 GB, 100% GPU), що не витискає інші процеси у своп на 16 GB Mac.
* Bad, because `gemma4:e4b` дає вищу якість перекладу (природніша українська, точніші ідіоми); різниця незначна для субтитрів, але існує. Neutral, because вибір моделі — константа `DEFAULT_MODEL` у `app/src/ollama.js`; `resolveModel` підхоплює першу наявну, якщо дефолту нема.

## More Information
- `DEFAULT_MODEL = 'gemma3:4b'` у `app/src/ollama.js`.
- Бенчмарк: `/tmp/bench.py`, субтитри Rick Astley (`dQw4w9WgXcQ`, 2089 символів), `num_ctx:8192`, `temperature:0.2`, `think:false`.
- Результати бенчмарку збережено у `/tmp/bench_results.json`, переклади — `/tmp/tr_<model>.txt`.
- Aya-expanse:8b і command-r7b (multilingual-спеціалізовані) показали ~19 tok/s і 6.4–6.8 GB RAM — повільніші й важчі за `gemma3:4b` при схожій якості.
- `ministral:8b` (Ministral 8B) відсутня в реєстрі ollama (HTTP 404); замінником використано `mistral:7b`.

---

## ADR `keep_alive: '5m'` для утримання Ollama-моделі між запитами

## Context and Problem Statement
Під час перекладу субтитрів модель вантажиться перед першим чанком і може бути вивантажена між запитами. Питання: як довго тримати модель у пам'яті після останнього запиту.

## Considered Options
* `keep_alive: 0` — негайне вивантаження після завершення перекладу
* `keep_alive: '5m'` — тримати модель 5 хвилин (поведінка Ollama за замовчуванням)

## Decision Outcome
Chosen option: "`keep_alive: '5m'`", because користувач явно попросив повернути 5-хвилинний таймаут після тимчасового переходу на `keep_alive: 0` — щоб модель не перевантажувалась між чанками одного перекладу і при повторних перекладах упродовж сесії.

### Consequences
* Good, because transcript фіксує очікувану користь: повторні переклади та переклад багатьох чанків не несуть 3–5 секунд overhead перезавантаження моделі.
* Bad, because модель залишається в RAM (3.3–9.6 GB залежно від моделі) ще 5 хвилин після перекладу, що на 16 GB Mac продовжує тиск на пам'ять. Neutral, because transcript не містить підтвердження наслідку щодо реального впливу 5-хвилинного утримання на загальну продуктивність системи після переходу на `gemma3:4b`.

## More Information
- Параметр передається в тілі запиту `POST /api/chat` у `app/src/ollama.js`.
- Додатково встановлено `num_ctx: 8192` (обмеження KV-кешу) і `temperature: 0.2`.
- До переходу на `keep_alive: 0` у коді існував `unloadModel` (`POST /api/generate`, `keep_alive: 0`), що викликався у `finally`-блоці. Функцію видалено після рішення повернути 5-хвилинний таймаут.
