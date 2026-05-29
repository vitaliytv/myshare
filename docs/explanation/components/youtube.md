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
2. Frontend `myshare` визначає YouTube video ID через JS `extractYoutubeVideoId` і відмічає URL у `youtubeByUrl` map — UI показує кнопку **«Субтитри»** поряд із посиланням.
3. Тап кнопки запускає Tauri-команду `yt_get_transcript(video_id, ['uk', 'en'])` — Rust послідовно стукає supadata: спершу `lang=uk`, на `404` падає на `lang=en`.
4. Перший успішний транскрипт відображається у діалозі з міткою фактичної мови (`uk`/`en`/`uk (auto)`).

??? engineer "Реалізація модуля `youtube` у `myshare`"
    - JS: `app/src/youtube.js` — тонкий wrapper. `extractYoutubeVideoId(url)` — чиста функція над URL (різноманіття форматів зручніше тримати у JS). `getYoutubeTranscript(videoId, preferred)` → `invoke('yt_get_transcript', {videoId, preferred})`.
    - Rust: `app/src-tauri/src/youtube.rs`. Команда `yt_get_transcript`:
        - Зчитує `SUPADATA_API_KEY` із env (підставляється з `app/src-tauri/.env` через `dotenvy::dotenv()` у `lib::run`). Якщо нема — `YoutubeError::MissingApiKey` із посиланням на signup.
        - Для кожної мови з `preferred` робить `GET {base}/v1/youtube/transcript?videoId=...&lang=...&text=true` із заголовком `x-api-key`.
        - Перший `200 OK` із непорожнім `content` повертається. `404` (мови нема) — `continue` до наступної. Інший HTTP-код — `Err(YoutubeError::Supadata)`.
        - Якщо всі preferred мови віддали `404` — `YoutubeError::NoMatchingLang { tried, available }` із доступними мовами (для пропозиції користувачу).
    - Helper `is_valid_video_id` — 11 символів base64url; перевіряє вхід перед HTTP, щоб не палити квоту на сміття.
    - **Без cookies, без зв'язку між запитами** — supadata stateless, кожен запит ходить через свіжий `reqwest::Client::new()`.

??? ops "Setup і квоти"
    - Реєстрація: https://supadata.ai/signup (free tier, без кредитки на старті).
    - Конфігурація: `cp app/src-tauri/.env.example app/src-tauri/.env` і встав `SUPADATA_API_KEY=sk_...`. `.env` у `.gitignore` — не комітимо.
    - Перевірка: `bun run start` → DevTools console: `await window.__TAURI__.core.invoke('yt_get_transcript', { videoId: 'dQw4w9WgXcQ', preferred: ['en'] })` має повернути `{ languageCode: 'en', text: '...', availableLangs: [...] }`.
    - Моніторинг квоти: supadata dashboard показує лічильник запитів. Можна додати rate-limiting у UI (один транскрипт у 10 сек), якщо вийдемо за free tier.

??? ops "Помилки, які покажуться у UI"
    - **`supadata API key не налаштовано...`** — нема `.env` із ключем.
    - **`supadata returned HTTP 429: ...`** — вичерпали квоту місяця. Або апгрейдимо план, або чекаємо новий цикл.
    - **`жодна з мов ["uk", "en"] недоступна; доступні: [...]`** — відео взагалі без uk/en субтитрів. Список наявних мов підставлено — можна показати їх у UI як кнопки вибору.

## Тести

- **Rust (6 тестів)**: `cargo test --lib`. `mockito::Server::new_async()` емулює supadata. Покриває happy-path (uk віддав текст), fallback (uk 404 → en 200), no-match (всі 404), unauthorized (401 пробрасується), invalid videoId, валідатор ID. API-key передається як параметр у `get_transcript_inner` — без global env mutation, тести deterministic у будь-якому порядку.
- **JS (54 тестів, з них YouTube — частина)**: `bun --cwd=app run test`. `extractYoutubeVideoId` повністю покриває формати URL. Для `getYoutubeTranscript` мокаємо `@tauri-apps/api/core::invoke` — перевіряємо контракт виклику (правильна команда + аргументи) і пробрасу помилок як рядків від Rust.
