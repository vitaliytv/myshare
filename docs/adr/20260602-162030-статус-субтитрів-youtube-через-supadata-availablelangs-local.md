---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-02T16:20:30+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

changelog-перевірка пройдена. Правило задоволено.

exit=0
[assistant]
Все готово. Підсумок змін:

**Rust (`app/src-tauri/src/youtube.rs`)**
- нова публічна команда `yt_list_languages(video_id)` → robить один GET до supadata, повертає `Vec<String>` мов
- зареєстрована в `lib.rs`

**JS (`app/src/youtube.js`)**
- нова функція `getYoutubeLanguages(videoId)` — обгортка над `yt_list_languages`

**JS (`app/src/caption-langs.js`)** ← новий файл
- `captionStatus(langs)` → `'uk' | 'en' | 'none'`
- `loadLangsCache` / `saveLangsCache` — кеш у localStorage (ключ `yt:langs`)

**UI (`app/src/App.vue`)**
- `ensureYoutube` тепер асинхронно запитує мови й оновлює кеш
- Замість одного великого «Субтитри»-button — два: чіп статусу + кнопка «↓ Субтитри», чіп оновлюється одразу

**Тести**
- 67 JS (6 файлів) + 10 Rust — всі green

---
<TRANSCRIPT END>

## ADR Статус субтитрів YouTube через supadata `availableLangs` + localStorage-кеш

## Context and Problem Statement
Застосунок `myshare` вже показував кнопку «Субтитри» для YouTube-лінків, але стан наявності мов (UA / EN / нема) стає відомим лише після тапу та повного фетчу транскрипту. Потрібно показувати статус субтитрів одразу по кожному лінку при завантаженні, не витрачаючи на кожен URL повний квотований запит транскрипту (free tier supadata — 100/місяць).

## Considered Options
* Виклик повного `yt_get_transcript` для кожного URL при рендерингу списку (витратить всю квоту)
* Нова команда `yt_list_languages` через один GET до supadata (поле `availableLangs` є в будь-якій відповіді transcript-endpoint) + кеш у `localStorage`

## Decision Outcome
Chosen option: "Нова команда `yt_list_languages` + localStorage-кеш", because supadata повертає `availableLangs` у будь-якій відповіді transcript-endpoint, тобто достатньо легкого запиту без завантаження тексту; кеш у `localStorage` (ключ `yt:langs`) гарантує, що для вже переглянутого `videoId` API-запит більше не виконується і квота не витрачається.

### Consequences
* Good, because для вже побачених відео статус відображається миттєво з `localStorage`, без мережевого запиту до supadata.
* Bad, because transcript не містить підтверджених негативних наслідків (кеш не має TTL — потенційно застарілий статус після появи нових субтитрів, але це в transcript не обговорювалося).

## More Information
- Rust: `app/src-tauri/src/youtube.rs` — `yt_list_languages(video_id)`, зареєстрована в `app/src-tauri/src/lib.rs`
- JS: `app/src/youtube.js` — `getYoutubeLanguages(videoId)` (обгортка над `yt_list_languages`)
- JS: `app/src/caption-langs.js` (новий файл) — `captionStatus(langs)` → `'uk' | 'en' | 'none'`; `loadLangsCache` / `saveLangsCache` (ключ `yt:langs`)
- UI: `app/src/App.vue` — `ensureYoutube` асинхронно запитує мови, кешує; чіп статусу + кнопка «↓ Субтитри»
- Тести: `app/src/caption-langs.test.js` (новий), `app/src/youtube.test.js` (розширено); 67 JS + 10 Rust — всі зелені
- Change-файл: `app/.changes/1780406329689-1e1e10.md` (bump minor, секція Added)
