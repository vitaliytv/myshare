# Glossary

Терміни проєкту `myshare`. Перший вхід у кожен LLM-промпт регенерації проекцій — для уникнення дрейфу термінології.

- **myshare** — Android-застосунок проєкту, що приймає посилання через стандартний Android Share механізм і відображає URL у UI.
- **Share intent** — системний Android-механізм `ACTION_SEND` із MIME-типом `text/plain`, через який інші застосунки передають URL у `myshare`.
- **Native Shell** — Rust + Tauri 2 mobile частина застосунку `myshare`, що приймає share intent від Android OS.
- **Frontend** — Vue 3 + Quasar + Vite частина застосунку `myshare`, що рендерить UI і показує URL.
- **Tauri event** — канал передачі даних із Native Shell у Frontend у застосунку `myshare`.
- **Local Storage** — Web `localStorage` WebView Android, у якому Frontend `myshare` персистить історію URL під ключем `myshare.sharedUrls`.
- **URL History** — JSON-масив рядків у Local Storage застосунку `myshare`, найсвіжіший URL індексом `0`; модуль `app/src/url-history.js`.
- **Page Metadata** — `{ title, favicon }` цільової сторінки прийнятого URL, які Frontend `myshare` фетчить через `@tauri-apps/plugin-http` (без CORS) і показує у картці; модуль `app/src/page-meta.js`.
- **Tauri HTTP Plugin** — `tauri-plugin-http` (Rust) + `@tauri-apps/plugin-http` (JS); транспорт у застосунку `myshare` для cross-origin запитів із Frontend, що йдуть через Rust і не блокуються WebView CORS.
- **YouTube Video ID** — 11-символьний base64url ідентифікатор відео, який Frontend `myshare` витягає з різних форматів YouTube URL для подальших запитів captionTracks; функція `extractYoutubeVideoId` у `app/src/youtube.js`.
- **YouTube Transcript** — `{ languageCode, text, availableLangs }`-обʼєкт, який повертає Tauri-команда `yt_get_transcript` для застосунку `myshare`. `text` — plain-text з YouTube субтитрів обраної мови (`uk` пріоритет, `en` fallback).
- **supadata** — комерційний transcript-API (https://supadata.ai), який Frontend `myshare` опосередковано викликає через Rust-команду `yt_get_transcript`. Тримає актуальний обхід YouTube PO-Token, тому застосунок `myshare` не реалізує власну Innertube-логіку.
- **SUPADATA_API_KEY** — env var із supadata API ключем, який Rust-команда `yt_get_transcript` додає у `x-api-key` header. Зчитується через `dotenvy` із `app/src-tauri/.env`. Без неї `myshare` повертає `MissingApiKey` помилку зі ссилкою на signup.
- **PO-Token** — Proof-of-Origin Token, введений YouTube у 2025 році для блокування anonymous-fetch до subtitle-endpoints. У застосунку `myshare` НЕ обходиться власноруч — це покладено на supadata.
- **Timedtext json3** — канонічний JSON-формат YouTube для субтитрів, який Frontend `myshare` запитує примусово (`&fmt=json3`) і парсить через `parseCaptionJson3`: `events[].segs[].utf8` склеюються у рядки. Стабільніший і простіший за XML.
- **Timedtext XML** — legacy/v3 формат субтитрів YouTube, що використовується як fallback у `parseCaptionXml`, коли сервер ігнорує `fmt=json3`. Існує дві версії: legacy `<transcript><text>` і v3 `<timedtext><body><p>`.
- **Share Helper** — desktop-only `<q-input>` у `App.vue`, що дозволяє розробнику застосунку `myshare` симулювати приймання share intent на macOS, де системного механізму немає; видимість контролюється модулем `app/src/platform.js`.
