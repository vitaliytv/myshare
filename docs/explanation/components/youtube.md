# Component: YouTube Captions (supadata)

Модуль `youtube` робить так, щоб для посилань на YouTube застосунок `myshare` показував кнопку «Субтитри», за тапом якої відкривається діалог із plain-text транскриптом — спершу українським, у разі відсутності — англійським. Користувач застосунку `myshare` отримує текст відео як читабельний транскрипт, не виходячи з картки історії URL.

## Чому supadata, а не власний YouTube-парсер

Спроби тримати subtitle-логіку всередині `myshare` (як власна, так і через `youtubei.js`) у 2025-2026 регулярно ламаються через **PO-Token** (Proof-of-Origin Token), запроваджений YouTube для блокування anonymous-fetch:

- **Raw `fetch` до `/api/timedtext`** — `200 OK` з **0 байт** body, навіть зі signed URL.
- **Innertube `POST /youtubei/v1/player`** з visitor-id, client-name, client-version — повертає response **без** `captionTracks` для anonymous-клієнтів.
- **`youtubei.js` через `tauri-plugin-http`** — кожен запит ішов окремим `reqwest::Client` без shared cookie jar → consent-сторінка або `400/403`.
- **`youtubei.js` через persistent Rust client із cookie jar** — `getInfo()` падав із `/next` 403; навіть `getBasicInfo` рідко повертав captions.

Реалістичний рівень обходу PO-Token (BotGuard JS-VM emulation, `Authorization: Bearer SAPISID...`) вимагає окремої команди-сервісу, який тримати у `myshare` — overkill. Зовнішній сервіс **supadata.ai** робить цю роботу за нас: тримає актуальний обхід anti-bot і віддає plain-text транскрипт за простим REST + `x-api-key`.

Free tier supadata дає 100 запитів на місяць — достатньо для одного користувача застосунку `myshare`, який ділиться кількома YouTube-посиланнями на день.

## Сценарій користувача

1. Користувач ділиться YouTube-посиланням у Android Share sheet (або вставляє у dev helper-input на маку).
2. Frontend `myshare` визначає YouTube video ID через JS `extractYoutubeVideoId` і відмічає URL у `youtubeByUrl` map. Одразу підтягується **статус наявності субтитрів** — Tauri-команда `yt_list_languages(video_id)` робить один запит до supadata й повертає список доступних мов. UI показує поряд із посиланням чіп: **🇺🇦 UA** (є українські), **🇬🇧 EN** (українських нема, але є англійські) або **Без UA·EN** (ні тих, ні тих; у tooltip — фактично доступні мови). Кнопка **«Субтитри»** активна, лише якщо є uk або en.
3. Список мов кешується у `localStorage` (map `videoId → string[]`, ключ `myshare.captionLangs`), тож повторні відкриття того самого відео не палять квоту supadata.
4. Тап кнопки запускає Tauri-команду `yt_get_transcript(video_id, ['uk', 'en'])` — Rust послідовно стукає supadata: спершу `lang=uk`, на `404` падає на `lang=en`.
5. Перший успішний транскрипт відображається у діалозі з міткою фактичної мови (`uk`/`en`/`uk (auto)`).

## Переклад EN→UA через локальний omlx (desktop)

Коли українських субтитрів нема, а англійські є (статус **🇬🇧 EN**), на **desktop** (Mac) поряд зʼявляється кнопка **«Перекласти»**. Вона тягне англійський транскрипт і перекладає його українською локальною LLM через **omlx** — OpenAI-compatible MLX-сервер на Apple Silicon, без хмари, без ключів, безкоштовно.

- **Чому omlx, а не хмарний переклад**: переклад великих транскриптів хмарними API коштує грошей і шле приватний контент назовні. omlx крутиться локально на Mac розробника; на Android кнопки нема (`canTranslate = !isAndroid`).
- **Чому omlx, а не Ollama**: omlx віддає стандартний **OpenAI-compatible** REST (`/v1/chat/completions`, `/v1/models`) — той самий протокол, що й у task-app, тож логіка перекладу переносна між проєктами. Apple-native MLX runtime працює швидше за llama.cpp-бекенд Ollama на Apple Silicon.
- **HTTP напряму з JS**: omlx слухає `http://127.0.0.1:8000/v1`, тож звертаємось через `tauri-plugin-http` (як `page-meta.js`) — окрема Rust-команда не потрібна.
- **Чанкінг**: транскрипт ріжемо на фрагменти (`chunkText`, ≤3500 символів по межах абзаців/рядків) і перекладаємо послідовно `POST /v1/chat/completions` (`stream:false`, `temperature:0.2`). Прогрес `done/total` показується у діалозі.
- **Модель**: дефолт `gemma-4-e4b-it-OptiQ-4bit`. `resolveModel` через `GET /v1/models` бере дефолт, якщо завантажений, інакше першу наявну (працює «з коробки» з будь-якою моделлю, доступною в omlx-сервері).
- **Кеш**: результат (`{model, originalLang, segments}`, де `segments` — пари `original↔translated`) кешується у `localStorage` за `videoId` (ключ `myshare.translations`). Повторний тап відкриває переклад миттєво — omlx не запускається вдруге.
- **Порівняння**: maximized-діалог із двоколонковою grid — ліворуч оригінал (EN), праворуч переклад (UA), вирівняні **посегментно** (рядок до рядка). На вузькому екрані колонки складаються в одну.
- **Помилки**: якщо omlx не запущено, fetch падає → у діалозі підказка стартувати сервер на `http://127.0.0.1:8000`.

??? engineer "Реалізація перекладу"
    - JS: `app/src/omlx.js` — `chunkText`, `buildMessages`, `extractContent` (чисті, OpenAI-compatible: `choices[0].message.content`), `translateChunk` (POST `/v1/chat/completions`, `temperature:0.2`, опційний `Authorization: Bearer <apiKey>`), `listOmlxModels` (GET `/v1/models`), `resolveModel`, `translateToUkrainian({onProgress})`. HTTP через `@tauri-apps/plugin-http`.
    - JS: `app/src/translation-cache.js` — `loadTranslations`/`saveTranslations`/`isValidEntry` (кеш у `localStorage`, биті записи відкидаються).
    - JS: `app/src/model-pref.js` — `loadModelPref`/`saveModelPref`, ключ `myshare.omlxModel` у `localStorage`.
    - UI: `app/src/App.vue` — кнопка «Перекласти»/«Переклад» (gated `canTranslate && status.kind==='en'`), `openTranslateDialog`, maximized-діалог `.cmp-grid`.
    - Тести: `omlx.test.js` (chunker, prompt, parsing, resolveModel, orchestration з mock fetch — формати OpenAI), `translation-cache.test.js` (валідація/round-trip).

??? engineer "Реалізація модуля `youtube` у `myshare`"
    - JS: `app/src/youtube.js` — тонкий wrapper. `extractYoutubeVideoId(url)` — чиста функція над URL (різноманіття форматів зручніше тримати у JS). `getYoutubeTranscript(videoId, preferred)` → `invoke('yt_get_transcript', {videoId, preferred})`. `getYoutubeLanguages(videoId)` → `invoke('yt_list_languages', {videoId})`.
    - JS: `app/src/caption-langs.js` — чиста `captionStatus(langs)` (зводить список мов до `uk`/`en`/`none`, нормалізує `uk-UA`/`en-US`) + `loadLangsCache`/`saveLangsCache` (кеш у `localStorage`).
    - Rust: `app/src-tauri/src/youtube.rs`. Команда `yt_list_languages` робить один `GET .../v1/youtube/transcript?videoId=...&text=true` (без `lang`), бере лише поле `availableLangs`; відео без субтитрів (`404`) → порожній `Vec`. Команда `yt_get_transcript`:
        - API ключ supadata **захардкоджено** у `SUPADATA_API_KEY` константі — нульовий setup для збірки/запуску. Ротація = правка константи + перебілд.
        - Для кожної мови з `preferred` робить `GET {base}/v1/youtube/transcript?videoId=...&lang=...&text=true` із заголовком `x-api-key`.
        - Перший `200 OK` із непорожнім `content` повертається. `404` (мови нема) — `continue` до наступної. Інший HTTP-код — `Err(YoutubeError::Supadata)`.
        - Якщо всі preferred мови віддали `404` — `YoutubeError::NoMatchingLang { tried, available }` із доступними мовами (для пропозиції користувачу).
    - Helper `is_valid_video_id` — 11 символів base64url; перевіряє вхід перед HTTP, щоб не палити квоту на сміття.
    - **Без cookies, без зв'язку між запитами** — supadata stateless, кожен запит ходить через свіжий `reqwest::Client::new()`.

??? ops "Setup і квоти"
    - API ключ зашитий у Rust-константі — користувачу/розробнику нічого не треба налаштовувати, `bun run start` одразу працює.
    - Ротація: відкрити `app/src-tauri/src/youtube.rs`, замінити значення `SUPADATA_API_KEY`, `bun run start` (Cargo побачить зміну і перебілдить за секунди).
    - Перевірка: `bun run start` → DevTools console: `await window.__TAURI__.core.invoke('yt_get_transcript', { videoId: 'dQw4w9WgXcQ', preferred: ['en'] })` має повернути `{ languageCode: 'en', text: '...', availableLangs: [...] }`.
    - Моніторинг квоти: supadata dashboard показує лічильник запитів. Можна додати rate-limiting у UI (один транскрипт у 10 сек), якщо вийдемо за free tier.

??? ops "Помилки, які покажуться у UI"
    - **`supadata returned HTTP 401: ...`** — ключ невалідний/відкликаний. Оновити константу `SUPADATA_API_KEY` у `youtube.rs` і перебілдити.
    - **`supadata returned HTTP 429: ...`** — вичерпали квоту місяця. Або апгрейдимо план, або чекаємо новий цикл.
    - **`жодна з мов ["uk", "en"] недоступна; доступні: [...]`** — відео взагалі без uk/en субтитрів. Список наявних мов підставлено — можна показати їх у UI як кнопки вибору.

## Тести

- **Rust (6 тестів)**: `cargo test --lib`. `mockito::Server::new_async()` емулює supadata. Покриває happy-path (uk віддав текст), fallback (uk 404 → en 200), no-match (всі 404), unauthorized (401 пробрасується), invalid videoId, валідатор ID. API-key передається як параметр у `get_transcript_inner` — без global env mutation, тести deterministic у будь-якому порядку.
- **JS (54 тестів, з них YouTube — частина)**: `bun --cwd=app run test`. `extractYoutubeVideoId` повністю покриває формати URL. Для `getYoutubeTranscript` мокаємо `@tauri-apps/api/core::invoke` — перевіряємо контракт виклику (правильна команда + аргументи) і пробрасу помилок як рядків від Rust.
