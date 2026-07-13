# Containers — myshare (C4 рівень 2)

`docs/ci4/02-containers.md` описує виконувані одиниці застосунку `myshare`: з яких процесів він складається, чим кожен володіє і як вони спілкуються між собою та із зовнішніми системами.

## Контейнер `vue-frontend` myshare

**Технологія:** Vue 3.5 + Quasar 2 + Vite 8, виконується у WebView Tauri (macOS — WKWebView, Android — Chromium WebView).

**Відповідальність:** Рендеринг UI списку прийнятих посилань `myshare`, відображення статусу субтитрів YouTube (UA / EN / none), запуск перекладу субтитрів EN→UA через локальний Ollama, LLM-агент через шар інструментів `app/src/tool/`, діалог налаштувань синхронізації (relay URL, Ory issuer, логін/логаут), відправка та прийом мутацій sync-двигуна.

**Дані:**

- OPFS `links.json` — список прийнятих посилань схеми `{version, linksSeq, items:[{id,url,createdAt,deleted}]}`; власник — `app/src/link-store.js`. Стара схема `string[]` у `localStorage['myshare.sharedUrls']` мігрується автоматично без втрати даних.
- `localStorage['myshare.translations']` — кеш перекладів субтитрів `{[videoId]: {model,originalLang,segments,deleted,updatedAt}}`; власник — `app/src/translation-cache.js`.
- `localStorage['yt:langs']` — кеш доступних мов субтитрів `{[videoId]: string[]}`; власник — `app/src/caption-langs.js`.
- `localStorage['myshare.ollamaModel']` — вибрана Ollama-модель (default `aya-expanse:8b`); власник — `app/src/model-pref.js`.
- `localStorage['myshare.deviceId']` — стабільний ідентифікатор пристрою (UUID); власник — `app/src/sync/device-id.js`.
- `localStorage['myshare.session']` — Ory access token та метадані сесії; власник — `app/src/sync/session-store.js`.

**Інтерфейси:**

- Контейнер `vue-frontend` myshare викликає Tauri-команди контейнера `tauri-backend` myshare: `yt_list_languages`, `yt_get_transcript`, `get_page_meta`; на Android — отримує подію `myshare:android-share`.
- Контейнер `vue-frontend` myshare звертається через `tauri-plugin-http` до зовнішньої системи Ollama (`http://localhost:11434`) — тільки на desktop: переклад субтитрів EN→UA (`POST /api/chat`) і список моделей (`GET /api/tags`).
- Контейнер `vue-frontend` myshare звертається через `tauri-plugin-http` до зовнішньої системи omlx (`http://127.0.0.1:8000/v1`, OpenAI-compatible) — тільки на desktop: LLM-агент через `app/src/tool/llm.js` (`createOpenAiChat`).
- Контейнер `vue-frontend` myshare синхронізується з контейнером `relay` myshare через WebSocket (desktop, persistent-з'єднання) і HTTP push/pull (Android): `POST /push` — відправка мутацій, `GET /pull?after=<seq>` — отримання нових мутацій.
- Контейнер `vue-frontend` myshare виконує Ory OAuth2/PKCE-логін: відкриває системний браузер з `authorization_endpoint` зовнішньої системи Ory Hydra, отримує authorization-code через deep-link `myshare://oauth/callback` (перехоплюється `tauri-plugin-deep-link` у контейнері `tauri-backend` myshare і передається назад у WebView-контекст).

**Розгортання:** macOS app bundle (WebView всередині Tauri-оболонки); Android APK (WebView всередині Tauri Android-активності).

---

## Контейнер `tauri-backend` myshare

**Технологія:** Rust 2024 edition + Tauri 2, `tauri-plugin-http`, `tauri-plugin-deep-link`.

**Відповідальність:** Надання нативних Tauri-команд для контейнера `vue-frontend` myshare: отримання транскриптів YouTube через зовнішню систему supadata API, перелік доступних мов субтитрів, витяг Open Graph / HTML метаданих довільних сторінок, обробка deep-link `myshare://oauth/callback` для OAuth2 PKCE redirect. Заплановано: on-device LLM-інференс LiteRT-LM (команда `litert_chat`) для Android-шляху LLM-агента.

**Дані:** Контейнер `tauri-backend` myshare не зберігає постійного стану між запусками — OAuth-токени, кеші посилань і перекладів живуть виключно у контейнері `vue-frontend` myshare (localStorage / OPFS).

**Інтерфейси:**

- Контейнер `tauri-backend` myshare виконує HTTPS-запити до зовнішньої системи supadata API — ініційовані командами `yt_list_languages` і `yt_get_transcript`.
- Контейнер `tauri-backend` myshare виконує HTTP(S)-запити до зовнішніх URL через `tauri-plugin-http` — ініційовані командою `get_page_meta`.
- Контейнер `tauri-backend` myshare отримує Android Share intent від ОС і генерує подію `myshare:android-share` для контейнера `vue-frontend` myshare.
- Контейнер `tauri-backend` myshare перехоплює deep-link `myshare://oauth/callback` і передає authorization-code у контейнер `vue-frontend` myshare через Tauri event.

**Розгортання:** Нативний бінарник всередині macOS app bundle; нативна Rust-бібліотека (`.so`) всередині Android APK.

---

## Контейнер `relay` myshare

**Технологія:** Bun 1.x + `bun:sqlite`; під vitest/Node використовується `node:sqlite` (ідентичний sync API — лениве визначення рантайму в `relay/src/db.js`).

**Відповідальність:** Self-hosted сервер синхронізації посилань і перекладів між пристроями `myshare`. Верифікація кожного запиту JWT зовнішньої системи Ory Hydra через JWKS (`jose.createRemoteJWKSet`; endpoint отримується динамічно через OIDC discovery `<issuer>/.well-known/openid-configuration`). Зберігання append-only журналу мутацій із server-assigned `seq`. Обслуговування WebSocket для desktop-клієнтів і HTTP-ендпоінтів push/pull для Android-клієнтів.

**Дані:**

- SQLite-база даних (шлях — env-змінна Bun-процесу) — таблиця `link_mutations` і таблиця `translation_mutations`; обидві містять стовпці `seq` (auto-increment), `user_id`, `payload` (JSON), `created_at`. Видалення записів реалізоване через tombstone-прапор `deleted` у `payload` — фізичне видалення рядків не виконується.

**Інтерфейси:**

- Контейнер `relay` myshare приймає WebSocket-з'єднання від контейнера `vue-frontend` myshare (desktop): отримує push-мутації, відповідає підтвердженням із сервер-призначеним `seq`, стримить нові мутації інших пристроїв.
- Контейнер `relay` myshare обслуговує HTTP-ендпоінти від контейнера `vue-frontend` myshare (Android): `POST /push` — прийом мутацій, `GET /pull?after=<seq>` — отримання нових мутацій.
- Контейнер `relay` myshare верифікує кожен запит JWT-токеном через JWKS зовнішньої системи Ory Hydra.

**Розгортання:** Окремий Bun-процес на self-hosted сервері поза app bundle; TLS обов'язковий (Android 16+ не підтримує cleartext HTTP за замовчуванням); зворотний проксі (nginx / Caddy) — поза кодом проєкту.

---

## Спільна конфігурація і секрети myshare

| Параметр | Де зберігається | Хто читає |
| --- | --- | --- |
| `RELAY_URL` | `localStorage` (зберігається через `SyncSettings.vue`) | `vue-frontend` → `sync/client.js` |
| `ORY_ISSUER` | `localStorage` (зберігається через `SyncSettings.vue`) | `vue-frontend` → `sync/auth.js` |
| OAuth2 client id `myshare` | Константа у `sync/auth.js` | `vue-frontend` |
| `myshare.deviceId` | `localStorage['myshare.deviceId']` | `vue-frontend` → `sync/device-id.js` |
| `myshare.session` (access token) | `localStorage['myshare.session']` | `vue-frontend` → `sync/session-store.js` |
| Ory JWKS URL | Отримується динамічно через OIDC discovery | `relay/src/auth.js` |
| relay DB path | Env-змінна Bun-процесу | `relay/src/db.js` |
| supadata API key | Env-змінна Tauri-процесу або вбудована константа у Rust | `tauri-backend` |

**Межі довіри:** контейнер `relay` myshare довіряє лише JWT, підписаному зовнішньою системою Ory Hydra; сирих паролів чи сесійних кукі не зберігає. Контейнер `vue-frontend` myshare надсилає до контейнера `relay` myshare лише access token — жодних сирих секретів або ключів supadata.

---

## Поточний стан myshare

### Реалізовано

- Контейнер `vue-frontend` myshare: список посилань (OPFS `links.json`, `app/src/link-store.js`), статус субтитрів YouTube (localStorage `yt:langs`, `app/src/caption-langs.js`), переклад EN→UA через Ollama (localStorage `myshare.translations`, `app/src/translation-cache.js`), вибір Ollama-моделі (`app/src/model-pref.js`), LLM-агент через `app/src/tool/` (omlx desktop-шлях `createOpenAiChat`), sync-двигун (`app/src/sync/{device-id,session-store,auth,client}.js`), діалог `SyncSettings.vue`.
- Контейнер `tauri-backend` myshare: команди `yt_list_languages`, `yt_get_transcript`, `get_page_meta`; Android Share intent; deep-link `myshare://oauth/callback` (`tauri-plugin-deep-link`).
- Контейнер `relay` myshare: SQLite-схема (`link_mutations`, `translation_mutations`), JWT-верифікація через Ory JWKS, WebSocket-транспорт (desktop), HTTP push/pull (Android), append-only seq-журнал із tombstones.

### Planned

- Контейнер `tauri-backend` myshare: Rust-команда `litert_chat` + бандлинг LiteRT-LM рантайму і моделі Gemma4-E2B — on-device інференс для Android-шляху LLM-агента (`createLiteRtChat` у `app/src/tool/llm.js` вже реалізована на JS-стороні, але reject'ає виклики до появи Rust-команди).
- TLS-термінація контейнера `relay` myshare через reverse-proxy (nginx / Caddy) — конфігурація поза кодом проєкту.
- Одноразовий ops-крок: реєстрація OAuth2-клієнта `myshare` (public, PKCE, `redirect_uri: myshare://oauth/callback`) у зовнішній системі Ory Hydra — команда і застереження задокументовані у `relay/README.md`.
