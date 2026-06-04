---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-03T12:57:03+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

## ADR Відображення статусу субтитрів через `availableLangs` supadata

## Context and Problem Statement
Застосунок `myshare` показував кнопку «Субтитри» для кожного YouTube-лінку, але наявність субтитрів конкретною мовою стала відома лише після тапу. Потрібно показувати статус (є UA / є EN / нема) одразу — без додаткових кліків.

## Considered Options
* Один запит до supadata transcript-endpoint: відповідь містить `availableLangs` при будь-якому результаті — включно з 404 (немає субтитрів → порожній список).
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Один запит до supadata `/youtube/transcript` і читання `availableLangs`", because supadata повертає повний список мов у кожній відповіді, тож окремий endpoint списку мов не потрібен — досить одного легкого запиту без `lang`-параметра і з `text=true`.

### Consequences
* Good, because transcript фіксує очікувану користь: статус (🇺🇦 UA / 🇬🇧 EN / «Без UA·EN») відображається одразу для кожного лінку без додаткових тапів.
* Bad, because кожна нова перевірка коштує 1 запит supadata (free tier — 100/міс); transcript фіксує рішення кешувати список мов у `localStorage` за `videoId` через новий модуль `caption-langs.js`.

## More Information
- Нова Tauri-команда: `yt_list_languages(video_id)` — `app/src-tauri/src/youtube.rs`
- JS-обгортка: `getYoutubeLanguages(videoId)` — `app/src/youtube.js`
- Чиста логіка + кеш: `app/src/caption-langs.js` (`captionStatus`, `loadLangsCache`, `saveLangsCache`, `STORAGE_KEY`)
- Реєстрація команди: `app/src-tauri/src/lib.rs`

---

## ADR EN→UA переклад субтитрів через локальний Ollama без нової Rust-команди

## Context and Problem Statement
Коли для YouTube-відео є лише англійські субтитри, потрібна можливість перекласти їх українською локально (тільки на десктопі/Mac, де доступний Ollama), зберегти результат і переглянути порівняно з оригіналом.

## Considered Options
* HTTP-запити до `http://localhost:11434` через `tauri-plugin-http` прямо з JS-модуля (як `page-meta.js`).
* Нова Rust Tauri-команда, що звертається до Ollama.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "HTTP через `tauri-plugin-http` з JS без нової Rust-команди", because Ollama локальний (`localhost:11434`), а `tauri-plugin-http` уже налаштований; додавати Rust-команду заради локального HTTP-запиту надлишково.

### Consequences
* Good, because transcript фіксує очікувану користь: кнопка «Перекласти» з'явилась, переклад по чанках із прогресом відпрацьовує, потрібні тести покривають логіку.
* Bad, because `http://**` wildcard у Tauri-capabilities не матчить URL із явним портом `:11434` — знадобилось окремо вписати `http://localhost:11434/*` і `http://127.0.0.1:11434/*` у `app/src-tauri/capabilities/default.json`.

## More Information
- Ollama-модуль: `app/src/ollama.js` (`chunkText`, `buildMessages`, `extractContent`, `translateChunk`, `listOllamaModels`, `resolveModel`, `translateToUkrainian`)
- Capabilities fix: `app/src-tauri/capabilities/default.json`
- Тести: `app/src/ollama.test.js`

---

## ADR Кешування перекладів субтитрів у `localStorage`

## Context and Problem Statement
Кожен переклад через Ollama — тривала операція (~15–45 с залежно від моделі); повторний виклик по тому самому відео марнує CPU/пам'ять і не дає нового результату.

## Considered Options
* Кеш у `localStorage` за `videoId` — зберігаємо `{ model, originalLang, segments }` після першого успішного перекладу.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Кеш перекладів у `localStorage` через окремий модуль `translation-cache.js`", because після збереження повторний тап відкриває діалог порівняння миттєво без будь-яких запитів.

### Consequences
* Good, because transcript фіксує очікувану користь: кнопка «Перекласти» стає «Переклад» після першого успіху — Ollama не запускається вдруге.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `app/src/translation-cache.js` (`isValidEntry`, `loadTranslations`, `saveTranslations`, `STORAGE_KEY`)
- Тести: `app/src/translation-cache.test.js`

---

## ADR Вибір `gemma3:4b` як дефолтної моделі Ollama та `keep_alive: '5m'`

## Context and Problem Statement
Початкова дефолтна модель `gemma4:e4b` (8.9 GB у RAM) викликала критичне гальмування комп'ютера з 16 GB unified-пам'яті: своп піднімався до 16 GB, pageouts — 1.6M. Перша ітерація виправлення — `keep_alive: 0` (негайне вивантаження після перекладу) — прибирала рештки, але вимагала перезавантаження моделі між чанками одного перекладу.

## Considered Options
* `gemma3:4b` (3.3 GB на диску, 4.4 GB у RAM, 100% GPU) з `keep_alive: '5m'`.
* `gemma4:e4b` (9.6 GB) з `keep_alive: 0`.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "`gemma3:4b` + `keep_alive: '5m'`", because модель вдвічі легша (4.4 GB проти 9.6 GB) і влазить у 16 GB разом з IDE/браузером без свопу; `keep_alive: '5m'` запобігає повторному вантаженню ваг між чанками і при наступних перекладах у межах 5-хвилинного вікна.

### Consequences
* Good, because transcript фіксує очікувану користь: бенчмарк показав `gemma3:4b` — 45 tok/s, total 17.8 s; модель завантажується цілком на GPU; своп після перемикання опустився з 16 GB до 9.4 GB.
* Bad, because `resolveModel` у `app/src/ollama.js` відкочується на першу наявну модель, якщо `gemma3:4b` не встановлена — непомітна деградація (завантажується важча модель).

## More Information
- Константа: `DEFAULT_MODEL = 'gemma3:4b'` — `app/src/ollama.js`
- Параметри запиту: `keep_alive: '5m'`, `num_ctx: 8192`, `temperature: 0.2` — `app/src/ollama.js` функція `translateChunk`
- Бенчмарк 9 моделей проведено через `/tmp/bench.py` на субтитрах Rick Astley `dQw4w9WgXcQ` (2089 символів, `lang=en`)
