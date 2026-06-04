---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-03T16:13:22+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

Сесія завершена, тому ось документація рішень:

---

## ADR Відображення статусу субтитрів через поле `availableLangs` supadata

## Context and Problem Statement
Застосунок `myshare` мав показувати по кожному YouTube-лінку, чи є субтитри українською, і якщо ні — чи є англійські. Раніше наявність мов дізнавалась лише після тапу (фетч усього транскрипту); потрібно було мати цю інформацію одразу, без затримки і без зайвих запитів.

## Considered Options
* Використовувати окремий ендпоінт метаданих відео supadata (якщо такий є)
* Отримувати `availableLangs` із відповіді transcript-ендпоінту

## Decision Outcome
Chosen option: "Отримувати `availableLangs` із відповіді transcript-ендпоінту", because supadata повертає поле `availableLangs` у будь-якій відповіді `GET /youtube/transcript`, тож один запит дає повний список мов без необхідності тягнути весь текст.

### Consequences
* Good, because transcript фіксує очікувану користь: одним запитом на відео отримуємо статус мов і показуємо його одразу в UI.
* Bad, because кожен новий YouTube-лінк коштує 1 запит квоти supadata (free tier — 100/міс); вирішено кешем у `localStorage` за `videoId` у `app/src/caption-langs.js`.

## More Information
- Нова Tauri-команда: `yt_list_languages(video_id)` у `app/src-tauri/src/youtube.rs`
- JS-обгортка: `getYoutubeLanguages` у `app/src/youtube.js`
- Логіка статусу і кеш мов: `app/src/caption-langs.js` (STORAGE_KEY → `localStorage`)
- UI: чіп 🇺🇦/🇬🇧/«Без UA·EN» у `app/src/App.vue`

---

## ADR Переклад субтитрів EN→UA через локальний Ollama (desktop-only)

## Context and Problem Statement
Коли YouTube-відео має лише англійські субтитри, користувачу потрібна можливість перекласти їх українською. Переклад має бути безкоштовним, офлайн і без передачі даних у хмару.

## Considered Options
* Локальний Ollama через `tauri-plugin-http` (HTTP до `localhost:11434`) — без нового Rust-коду
* Нова Rust/Tauri-команда для HTTP-виклику до Ollama

## Decision Outcome
Chosen option: "Локальний Ollama через `tauri-plugin-http`", because HTTP до Ollama йде так само, як у `page-meta.js` до зовнішніх URL — без додаткового Rust-шару, що спрощує код.

### Consequences
* Good, because transcript фіксує очікувану користь: переклад безкоштовний, офлайн, без хмари, кешується у `localStorage` — повторний тап відкриває готовий результат миттєво.
* Bad, because Tauri HTTP scope `http://**` не матчить URL із явним портом (`:11434`), тому довелось явно додати `http://localhost:11434/*` та `http://127.0.0.1:11434/*` у `app/src-tauri/capabilities/default.json`.

## More Information
- Модуль перекладу: `app/src/ollama.js` (`chunkText`, `translateToUkrainian`, `resolveModel`)
- Кеш перекладів: `app/src/translation-cache.js`
- UI: діалог порівняння оригінал↔переклад (`.cmp-grid`) у `app/src/App.vue`
- Дозволи HTTP: `app/src-tauri/capabilities/default.json` — додано `localhost:11434` і `127.0.0.1:11434`

---

## ADR Вибір дефолтної Ollama-моделі для перекладу субтитрів

## Context and Problem Statement
Після реалізації перекладу через Ollama система сильно гальмувала: на 16 GB unified RAM модель `gemma4:e4b` (9.6 GB на диску, 10.6 GB у RAM) при завантаженні витісняла всі інші процеси у своп (16 GB зайнятого свопу, 1.6M pageouts). Потрібно було обрати модель, що дає прийнятну якість без переповнення пам'яті.

## Considered Options
* `gemma3:4b` — 3.3 GB на диску, 4.4 GB у RAM, 37 tok/s
* `gemma4:e4b` — 9.6 GB на диску, 10.6 GB у RAM, 29 tok/s
* `aya-expanse:8b`, `aya:8b`, `command-r7b` — multilingual-спеціалізовані, ~5–7 GB у RAM, 18–20 tok/s
* Менші: `gemma3:1b`, `qwen3:1.7b` — зациклюються; `qwen3:4b` — не перекладає (reasoning не вимикається)

## Decision Outcome
Chosen option: "`gemma3:4b`", because бенчмарк на реальних субтитрах показав: якість майже не поступається gemma4:e4b, натомість RAM лише 4.4 GB (≈2.4× менше) — влазить без свопу навіть при відкритому dev-оточенні. Спеціалізовані multilingual-моделі (Aya, Command-R) мають гіршу якість при більшому RAM-сліді.

### Consequences
* Good, because transcript фіксує очікувану користь: переклад відбувається без свопу і стопу системи, full text за ~14s.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Константа дефолту: `DEFAULT_MODEL = 'gemma3:4b'` у `app/src/ollama.js`
- Параметри запиту: `keep_alive:'5m'`, `num_ctx:8192` (обмежує KV-кеш)
- Бенчмарк: 9 моделей на субтитрах Rick Astley (`dQw4w9WgXcQ`, 2089 симв.); скрипт `/tmp/bench.py`
- Переклад-спеціалізовані моделі (NLLB-200, MADLAD-400, TowerInstruct, ALMA) Ollama не підтримує або не покриває українську
