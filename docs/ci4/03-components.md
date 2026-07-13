# Components (C4 рівень 3) — myshare

Документ описує логічні компоненти застосунку `myshare` всередині кожного контейнера. Аудиторія — інженер `myshare` перед роботою над фічею.

## Поточний стан

### Реалізовано

- Контейнер `tauri-backend` myshare: команди Tauri для YouTube (`yt_list_languages`), обробка OAuth2 deep-link callback через `tauri-plugin-deep-link`.
- Контейнер `vue-frontend` myshare: `link-store` (OPFS), `opfs-helper`, `translation-cache`, `caption-langs`, `ollama-client`, `omlx-client`, `page-meta`, `model-pref`, `tool-catalog`, `tool-llm`, `sync-auth`, `session-store`, `device-id`, `sync-client`, `app-view`, `sync-settings`.
- Контейнер `relay` myshare: `relay-server`, `relay-db`, `relay-auth`, `relay-sync`, `relay-router`.

### Planned

- Контейнер `tauri-backend` myshare: Rust-команда `litert_chat` для on-device LiteRT-LM інференсу на Android (Gemma4-E2B); бандлинг LiteRT-LM рантайму ще не реалізовано.

---

## Контейнер `tauri-backend` myshare

Контейнер `tauri-backend` myshare — Rust-процес Tauri, що надає нативні можливості (файлова система, HTTP-запити з розширеним scope, OAuth2 deep-link) через IPC до контейнера `vue-frontend` myshare.

### Компонент `tauri-commands` myshare

**Відповідальність.** Компонент `tauri-commands` myshare реєструє всі Tauri IPC-команди застосунку `myshare` у `tauri::generate_handler!` і передає їх рушієві Tauri (`app/src-tauri/src/lib.rs`).

**Залежності:**

- Входи: контейнер `vue-frontend` myshare — `invoke()` IPC-виклики з JS-шару.
- Виходи: компонент `youtube-commands` myshare (`yt_list_languages`); зовнішня система Tauri Runtime.

**Тести:** TBD: tests

**Трасування:** не застосовується (детермінований диспетчер).

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `youtube-commands` myshare

**Відповідальність.** Компонент `youtube-commands` myshare реалізує Tauri-команду `yt_list_languages(video_id)`, що виконує HTTP-запит до supadata API і повертає масив доступних мовних кодів субтитрів відео (`app/src-tauri/src/youtube.rs`).

**Залежності:**

- Входи: компонент `tauri-commands` myshare (реєструє команду); контейнер `vue-frontend` myshare (IPC-виклик).
- Виходи: зовнішня система supadata API (`https://api.supadata.ai/youtube/transcript`).

**Тести:** TBD: tests

**Трасування:** TBD: tracing-storage (HTTP-запит до зовнішнього supadata, результат залежить від наявності субтитрів у YouTube).

**Релевантні ADR:**

- `20260602-162030-статус-субтитрів-youtube`

### Компонент `deep-link-handler` myshare

**Відповідальність.** Компонент `deep-link-handler` myshare обробляє OAuth2 PKCE callback через схему `myshare://oauth/callback` за допомогою `tauri-plugin-deep-link`, передаючи authorization code до контейнера `vue-frontend` myshare через подію глибокого посилання (`app/src-tauri/src/lib.rs`, `app/src-tauri/tauri.conf.json`).

**Залежності:**

- Входи: зовнішня система Ory Hydra — redirect-відповідь на `myshare://oauth/callback?code=...` після авторизації.
- Виходи: компонент `sync-auth` myshare (отримує code через deep-link подію).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

---

## Контейнер `vue-frontend` myshare

Контейнер `vue-frontend` myshare — Vue 3 / Quasar SPA, що виконується у WebView Tauri. Реалізує UI, доменну логіку, tool-surface для LLM-агента та sync-двигун застосунку `myshare`.

### Компонент `opfs-helper` myshare

**Відповідальність.** Компонент `opfs-helper` myshare є спільним хелпером для доступу до Origin Private File System (OPFS) через `FileSystemAccessAPI`, винесений з `link-store` myshare для повторного використання (`app/src/opfs.js`).

**Залежності:**

- Входи: компонент `link-store` myshare.
- Виходи: нативний браузерний OPFS API.

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `link-store` myshare

**Відповідальність.** Компонент `link-store` myshare зберігає список посилань у форматі append-only журналу в OPFS-файлі `links.json` зі схемою `{version, linksSeq, items:[{id,url,createdAt,deleted}]}`, підтримує міграцію зі старого рядкового формату, додавання (`appendLink`), видалення через tombstone (`removeLink`/`deleted: true`), та методи для sync-двигуна: `_applyRemoteLinkMutation`, `_lastSyncedSeq`, `_setLastSyncedSeq` (`app/src/link-store.js`).

**Залежності:**

- Входи: компонент `app-view` myshare (додавання/видалення посилань); компонент `sync-client` myshare (`_applyRemoteLinkMutation`, `_lastSyncedSeq`).
- Виходи: компонент `opfs-helper` myshare (файловий доступ до `links.json`); компонент `tool-catalog` myshare (надає доступ до списку посилань через tool `page_meta`).

**Тести:** `app/src/link-store.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `20260528-133414-url-history-localstorage`
- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `translation-cache` myshare

**Відповідальність.** Компонент `translation-cache` myshare зберігає кеш перекладів субтитрів у `localStorage` (ключ `myshare.translations`) із записами `{model, originalLang, segments:[{original,translated}], deleted, updatedAt}`, підтримує tombstone-видалення (`removeTranslation`) та методи sync-двигуна `_applyRemoteTranslationMutation`/`_lastSyncedSeq`/`_setLastSyncedSeq` (`app/src/translation-cache.js`).

**Залежності:**

- Входи: компонент `ollama-client` myshare (збереження результату перекладу); компонент `sync-client` myshare (`_applyRemoteTranslationMutation`); компонент `app-view` myshare (читання кешу).
- Виходи: `localStorage['myshare.translations']`.

**Тести:** `app/src/translation-cache.test.js`

**Трасування:** не застосовується (детермінований CRUD).

**Релевантні ADR:**

- `20260602-163928-ollama-переклад-субтитрів`
- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `caption-langs` myshare

**Відповідальність.** Компонент `caption-langs` myshare визначає статус субтитрів YouTube (`captionStatus()` → `{kind: 'uk'|'en'|'none', langs}`) з нормалізацією мовних кодів (`uk-UA`→`uk`, `en-US`→`en`) та кешує відповідь `videoId→availableLangs` у `localStorage` (ключ `yt:langs`) через `loadLangsCache`/`saveLangsCache` (`app/src/caption-langs.js`).

**Залежності:**

- Входи: компонент `app-view` myshare (виклик `captionStatus`, операції з кешем); компонент `youtube-commands` myshare через IPC (отримання `availableLangs` від supadata).
- Виходи: `localStorage['yt:langs']`; компонент `app-view` myshare (статус `'uk'|'en'|'none'`).

**Тести:** `app/src/caption-langs.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `20260602-162030-статус-субтитрів-youtube`

### Компонент `ollama-client` myshare

**Відповідальність.** Компонент `ollama-client` myshare виконує покроковий переклад тексту EN→UA через локальний Ollama (`POST http://localhost:11434/api/chat`), розбиваючи текст на чанки ≤3500 символів, вибираючи модель через `resolveModel` (дефолт `aya-expanse:8b`), надаючи callback `onProgress` для прогрес-бару (`app/src/ollama.js`).

**Залежності:**

- Входи: компонент `tool-catalog` myshare (через tool `translate`); компонент `app-view` myshare (прямий виклик із `ctx.onProgress`).
- Виходи: зовнішня система Ollama (`localhost:11434`, локальний HTTP-сервер); компонент `translation-cache` myshare (збереження перекладеного результату).

**Тести:** `app/src/ollama.test.js`

**Трасування:** TBD: tracing-storage (LLM-виклик, недетермінований переклад).

**Релевантні ADR:**

- `20260602-163928-ollama-переклад-субтитрів`
- `20260603-134252-ollama-вибір-моделі-перекладу`

### Компонент `omlx-client` myshare

**Відповідальність.** Компонент `omlx-client` myshare є OpenAI-сумісним клієнтом для desktop-LLM через omlx (`http://127.0.0.1:8000/v1`), використовуваним адаптером `createOpenAiChat` у tool-calling loop компонента `tool-llm` myshare (`app/src/omlx.js`).

**Залежності:**

- Входи: компонент `tool-llm` myshare (через `createOpenAiChat` адаптер).
- Виходи: зовнішня система omlx (локальний MLX-сервер `127.0.0.1:8000`).

**Тести:** `app/src/tool/llm.test.js`

**Трасування:** TBD: tracing-storage (LLM-виклик, недетермінований вихід агента).

**Релевантні ADR:**

- `260615-1030-n-tool-surface-llm-доступний-шар`

### Компонент `page-meta` myshare

**Відповідальність.** Компонент `page-meta` myshare витягує метадані URL (title, description, og:image) через HTTP-запит із використанням `tauri-plugin-http` (`app/src/page-meta.js`).

**Залежності:**

- Входи: компонент `tool-catalog` myshare (tool `page_meta`); компонент `app-view` myshare.
- Виходи: зовнішня система (цільова URL сторінки посилання).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `260615-1030-n-tool-surface-llm-доступний-шар`

### Компонент `model-pref` myshare

**Відповідальність.** Компонент `model-pref` myshare зберігає і читає поточний вибір Ollama-моделі користувача з `localStorage` (ключ `myshare.ollamaModel`) через `loadModelPref`/`saveModelPref` (`app/src/model-pref.js`).

**Залежності:**

- Входи: компонент `app-view` myshare (вибір моделі через `<q-select>` у тулбарі).
- Виходи: `localStorage['myshare.ollamaModel']`; компонент `ollama-client` myshare (поточна модель передається у `translateToUkrainian`).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `20260603-134252-ollama-вибір-моделі-перекладу`

### Компонент `tool-catalog` myshare

**Відповідальність.** Компонент `tool-catalog` myshare є єдиним каталогом іменованих дій (`TOOLS`) застосунку `myshare` зі схемами вводу і хендлерами `run(input)`. Реєструє tools: `youtube_id`, `languages`, `transcript`, `page_meta`, `translate`. Компонент `dispatch` myshare валідує схему та повертає уніфікований конверт `{ok, output}|{ok:false, error:{code}}`. Компонент `manifest` myshare генерує OpenAI function-calling маніфест. Компонент `scope` myshare реалізує trust tiers (`read < write < destructive`) через `allowsTier`/`scopedManifest`/`guardDispatch` (`app/src/tool/`).

**Залежності:**

- Входи: компонент `app-view` myshare (UI-виклики через `dispatch`); компонент `tool-llm` myshare (LLM tool-calling loop через `dispatch`).
- Виходи: компонент `caption-langs` myshare (tool `languages`); компонент `page-meta` myshare (tool `page_meta`); компонент `ollama-client` myshare (tool `translate`); зовнішня система supadata API (tool `transcript`).

**Тести:** `app/src/tool/tool.test.js`

**Трасування:** TBD: tracing-storage (диспетч до tools `translate` і `transcript` є недетермінованими).

**Релевантні ADR:**

- `260615-1030-n-tool-surface-llm-доступний-шар`

### Компонент `tool-llm` myshare

**Відповідальність.** Компонент `tool-llm` myshare реалізує tool-calling loop LLM-агента (`runAgent`) і два chat-адаптери: `createOpenAiChat` (omlx на desktop, `http://127.0.0.1:8000/v1`) та `createLiteRtChat` (LiteRT-LM на Android через Tauri-команду `litert_chat`). Функція `selectChat({android})` обирає адаптер за платформою (`app/src/tool/llm.js`).

**Залежності:**

- Входи: компонент `app-view` myshare або зовнішній оркестратор (запуск `runAgent`).
- Виходи: компонент `tool-catalog` myshare (dispatch tool-викликів у loop); компонент `omlx-client` myshare (desktop); компонент `tauri-commands` myshare (Android, Tauri-команда `litert_chat` — Planned).

**Тести:** `app/src/tool/llm.test.js`

**Трасування:** TBD: tracing-storage (недетермінований LLM tool-calling loop).

**Релевантні ADR:**

- `260615-1030-n-tool-surface-llm-доступний-шар`

### Компонент `sync-auth` myshare

**Відповідальність.** Компонент `sync-auth` myshare реалізує Ory Hydra OAuth2 Authorization Code + PKCE флоу для native-клієнта `myshare`: відкриває браузер на authorization endpoint (через OIDC discovery `<issuer>/.well-known/openid-configuration`), чекає deep-link callback `myshare://oauth/callback?code=...`, обмінює code на tokens через token endpoint і зберігає їх у компоненті `session-store` myshare (`app/src/sync/auth.js`).

**Залежності:**

- Входи: компонент `sync-settings` myshare (кнопка «Увійти»/«Вийти»); компонент `deep-link-handler` myshare (authorization code через deep-link подію).
- Виходи: зовнішня система Ory Hydra (authorization endpoint + token endpoint); компонент `session-store` myshare (збереження access/refresh токенів).

**Тести:** `app/src/sync/auth.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `session-store` myshare

**Відповідальність.** Компонент `session-store` myshare зберігає OAuth2 access/refresh токени та relay URL у `localStorage`, надаючи `loadSession`/`saveSession`/`clearSession` для компонентів `sync-auth` myshare та `sync-client` myshare (`app/src/sync/session-store.js`).

**Залежності:**

- Входи: компонент `sync-auth` myshare (збереження tokens після логіну); компонент `sync-client` myshare (читання tokens для авторизованих запитів до relay).
- Виходи: `localStorage` (ключі сесії relay).

**Тести:** `app/src/sync/session-store.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `device-id` myshare

**Відповідальність.** Компонент `device-id` myshare генерує та зберігає стабільний UUID пристрою у `localStorage`, що relay-сервер myshare використовує для розрізнення джерел мутацій при синхронізації (`app/src/sync/device-id.js`).

**Залежності:**

- Входи: компонент `sync-client` myshare.
- Виходи: `localStorage` (ключ device ID).

**Тести:** `app/src/sync/device-id.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `sync-client` myshare

**Відповідальність.** Компонент `sync-client` myshare реалізує двосторонню синхронізацію між пристроями через relay-сервер myshare: WebSocket для desktop (persistent-з'єднання), HTTP push/pull для Android. Застосовує вхідні мутації до компонента `link-store` myshare та `translation-cache` myshare через `_applyRemote*`-методи, використовує компоненти `device-id` myshare та `session-store` myshare для формування авторизованих запитів (`app/src/sync/client.js`).

**Залежності:**

- Входи: компонент `app-view` myshare (`startSync`, `pullOnce`, push мутацій при додаванні/видаленні).
- Виходи: компонент `link-store` myshare (`_applyRemoteLinkMutation`); компонент `translation-cache` myshare (`_applyRemoteTranslationMutation`); зовнішня система relay myshare (HTTP/WS запити).

**Тести:** `app/src/sync/client.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `app-view` myshare

**Відповідальність.** Компонент `app-view` myshare є головним Vue-компонентом застосунку `myshare` (`app/src/App.vue`): рендерить список посилань із чіпами статусу субтитрів (🇺🇦/🇬🇧/«Без UA·EN»), прогрес-бар перекладу, діалог порівняння EN↔UA, кнопку видалення; делегує дії через `dispatch` компонента `tool-catalog` myshare; запускає `startSync`/`pullOnce` при старті за наявності сесії; обробляє подію `myshare:sync-updated` від компонента `sync-client` myshare.

**Залежності:**

- Входи: зовнішня система Android Share intent (нові посилання через подію `myshare:android-share`); компонент `sync-client` myshare (вхідні мутації через подію `myshare:sync-updated`).
- Виходи: компонент `tool-catalog` myshare (`dispatch` для `languages`, `transcript`, `page_meta`, `translate`); компонент `sync-client` myshare (`startSync`, `pullOnce`, push мутацій); компонент `sync-settings` myshare (відкриття діалогу); компонент `model-pref` myshare (читання/збереження вибору моделі).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `20260528-133414-url-history-localstorage`
- `20260602-162030-статус-субтитрів-youtube`
- `20260602-163928-ollama-переклад-субтитрів`
- `20260603-134252-ollama-вибір-моделі-перекладу`
- `260615-1030-n-tool-surface-llm-доступний-шар`
- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `sync-settings` myshare

**Відповідальність.** Компонент `sync-settings` myshare — Vue-діалог налаштувань синхронізації застосунку `myshare`: містить поля relay URL та Ory issuer, кнопки «Увійти»/«Вийти», відображення статусу поточної сесії (`app/src/components/SyncSettings.vue`).

**Залежності:**

- Входи: компонент `app-view` myshare (відкриття діалогу).
- Виходи: компонент `sync-auth` myshare (запуск OAuth2 логіну/логауту); компонент `session-store` myshare (читання поточної сесії для відображення стану).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

---

## Контейнер `relay` myshare

Контейнер `relay` myshare — легкий self-hosted Bun/Node.js HTTP/WS-сервер, посередник синхронізації між пристроями застосунку `myshare`. Верифікує Bearer JWT через Ory Hydra JWKS, зберігає append-only журнал мутацій у SQLite.

### Компонент `relay-server` myshare

**Відповідальність.** Компонент `relay-server` myshare є точкою входу контейнера `relay` myshare: запускає HTTP/WS-сервер, ініціалізує компонент `relay-db` myshare і передає запити компоненту `relay-router` myshare (`relay/src/server.js`).

**Залежності:**

- Входи: контейнер `vue-frontend` myshare (HTTP/WS-з'єднання).
- Виходи: компонент `relay-router` myshare; компонент `relay-db` myshare.

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `relay-auth` myshare

**Відповідальність.** Компонент `relay-auth` myshare верифікує Bearer JWT кожного запиту через `jose.createRemoteJWKSet` проти Ory Hydra JWKS endpoint, повертає `sub` claim як ідентифікатор користувача для авторизації sync-операцій (`relay/src/auth.js`).

**Залежності:**

- Входи: компонент `relay-router` myshare (middleware перевірки автентифікації).
- Виходи: зовнішня система Ory Hydra (JWKS endpoint).

**Тести:** `relay/src/auth.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `relay-db` myshare

**Відповідальність.** Компонент `relay-db` myshare реалізує SQLite-шар сховища контейнера `relay` myshare з підтримкою `bun:sqlite` (Bun-рантайм) та `node:sqlite` (тести/Node). Зберігає append-only журнал мутацій посилань і перекладів із server-assigned `seq` для детермінованого merge (`relay/src/db.js`).

**Залежності:**

- Входи: компонент `relay-sync` myshare (запити на читання/запис журналу).
- Виходи: SQLite-файл (локальне сховище relay).

**Тести:** `relay/src/db.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `relay-sync` myshare

**Відповідальність.** Компонент `relay-sync` myshare реалізує бізнес-логіку синхронізації relay myshare: append мутацій у журнал через компонент `relay-db` myshare, pull мутацій за `seq`-курсором, tombstone-видалення (прапор `deleted`), append-only merge-стратегія за server-assigned `seq` (`relay/src/sync.js`).

**Залежності:**

- Входи: компонент `relay-router` myshare (HTTP/WS sync-хендлери).
- Виходи: компонент `relay-db` myshare.

**Тести:** `relay/src/sync.test.js`

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`

### Компонент `relay-router` myshare

**Відповідальність.** Компонент `relay-router` myshare маршрутизує HTTP/WS-запити до відповідних хендлерів контейнера `relay` myshare, застосовуючи middleware компонента `relay-auth` myshare для верифікації JWT на кожному захищеному маршруті (`relay/src/router.js`).

**Залежності:**

- Входи: компонент `relay-server` myshare (вхідні запити).
- Виходи: компонент `relay-auth` myshare (auth middleware); компонент `relay-sync` myshare (sync-хендлери).

**Тести:** TBD: tests

**Трасування:** не застосовується.

**Релевантні ADR:**

- `relay-sync-cherez-ory-oauth2-pkce`
