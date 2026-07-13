# Code (C4 рівень 4) — myshare

Аудиторія: інженер myshare, який пише код. Документ описує конкретні файли, функції, конфігурацію та операції застосунку myshare.

## Поточний стан

### Реалізовано

- Tauri-команди `yt_get_transcript`, `yt_list_languages` зареєстровані в `app/src-tauri/src/lib.rs`
- Vue-компоненти `App.vue` і `SyncSettings.vue`
- Tool-шар `app/src/tool/{catalog,dispatch,manifest,llm,scope}.js`
- Sync-двигун `app/src/sync/{device-id,session-store,auth,client}.js`
- Relay-сервер `relay/src/{server,db,auth,sync,router}.js`
- OPFS-хелпер `app/src/opfs.js`; схема link-store з `deleted`-tombstones

### Planned

- Rust-команда `litert_chat` для LiteRT-LM на Android — `createLiteRtChat` у `app/src/tool/llm.js` існує лише як JS-заглушка
- MCP-обгортка над tool-каталогом

---

## Tauri-команди myshare

| Команда | Сигнатура Rust | Файл | Відповідальність |
| --- | --- | --- | --- |
| `yt_get_transcript` | `async fn yt_get_transcript(video_id: String, preferred: Vec<String>) -> Result<YoutubeTranscript, String>` | `app/src-tauri/src/youtube.rs` | Запитує транскрипт через supadata, пробуючи мови з `preferred` по порядку; повертає `YoutubeTranscript { language_code, text, available_langs }` |
| `yt_list_languages` | `async fn yt_list_languages(video_id: String) -> Result<Vec<String>, String>` | `app/src-tauri/src/youtube.rs` | Один GET до supadata; повертає лише `availableLangs` без завантаження тексту; при 404 або відсутніх субтитрах — порожній вектор |
| `litert_chat` | TBD: команду не реалізовано | `app/src-tauri/src/lib.rs` | On-device LLM-інференс через LiteRT-LM + Gemma4-E2B на Android; виклики через `createLiteRtChat` у `app/src/tool/llm.js` reject-яться до появи реалізації |

Усі Tauri-команди реєструються в `app/src-tauri/src/lib.rs` через `tauri::generate_handler![youtube::yt_get_transcript, youtube::yt_list_languages]`.

---

## Vue-компоненти myshare

| Компонент | Props | Файл | Stores / модулі |
| --- | --- | --- | --- |
| `App.vue` | — (root-компонент) | `app/src/App.vue` | `link-store.js` (OPFS `links.json`), `translation-cache.js` (`localStorage['translation_cache_v1']`), `caption-langs.js` (`localStorage['yt:langs']`), `model-pref.js` (`localStorage['myshare.ollamaModel']`), `sync/client.js` |
| `SyncSettings.vue` | — (відкривається через `v-model:show`) | `app/src/components/SyncSettings.vue` | `sync/client.js`, `sync/session-store.js`, `sync/auth.js` |

### App.vue — ключові обов'язки

- При `onMounted`: завантаження посилань із OPFS через `linkStore.load()` і запуск `startSync()` / `pullOnce()` якщо є сесія у `sessionStore`.
- Прослуховування `myshare:android-share` — `appendLink`, push мутації до relay-сервера через `sync/client.js`.
- Асинхронне збагачення кожного YouTube-посилання через tool-dispatch: `languages` → чіп 🇺🇦 UA / 🇬🇧 EN / «Без UA·EN»; `transcript` → діалог субтитрів; `translate` → діалог порівняння EN ↔ UA з прогрес-баром.
- Прослуховування `myshare:sync-updated` — merge прийнятих мутацій через `_applyRemoteLinkMutation` / `_applyRemoteTranslationMutation`.
- Кнопка видалення посилання → `removeLink` + push tombstone-мутації.
- Перемикач Ollama-моделі через `<q-select>` у тулбарі (приховано на Android через `!isAndroidPlatform()`).

### SyncSettings.vue — ключові обов'язки

- Форма введення relay URL і Ory issuer URL із збереженням у `localStorage`.
- Кнопки «Увійти» (PKCE-флоу через `app/src/sync/auth.js`) і «Вийти» (`sessionStore.clear()`).
- Відображення `device_id` і статусу WebSocket-з'єднання.

---

## JS-модулі myshare

### Tool-шар (`app/src/tool/`)

| Модуль | Файл | Відповідальність |
| --- | --- | --- |
| `catalog.js` | `app/src/tool/catalog.js` | Масив `TOOLS` — єдине джерело правди; кожен tool: `{ tier, name, summary, input, run }`; наявні tools: `youtube_id`, `languages`, `transcript`, `page_meta`, `translate` |
| `dispatch.js` | `app/src/tool/dispatch.js` | `createDispatch(transport)` — валідація схеми, уніфікований конверт `{ ok, output }` / `{ ok, error: { code } }`; необов'язковий `ctx` для `onProgress` / `signal` (in-app, не серіалізується в LLM-маніфест) |
| `manifest.js` | `app/src/tool/manifest.js` | `toolManifest(allow)` в OpenAI function-calling форматі; `listTools()` — похідні від каталогу |
| `scope.js` | `app/src/tool/scope.js` | Trust-tier'и `read < write < destructive`; `allowsTier`, `scopedManifest(actor)`, `guardDispatch(dispatch, actor)`; людина — до `destructive`, агент — до `write` |
| `llm.js` | `app/src/tool/llm.js` | `runAgent` (tool-calling loop); `createOpenAiChat` (omlx `http://127.0.0.1:8000/v1`, desktop); `createLiteRtChat` (LiteRT-LM, Android, TBD); `selectChat({ android })` |

TBD: tracing-storage (для `runAgent` і tool-dispatch)

### Sync-двигун (`app/src/sync/`)

| Модуль | Файл | Відповідальність |
| --- | --- | --- |
| `device-id.js` | `app/src/sync/device-id.js` | Генерація та зберігання стабільного UUID пристрою в `localStorage` |
| `session-store.js` | `app/src/sync/session-store.js` | Збереження OAuth-токенів (access / refresh / id) у `localStorage`; `get` / `set` / `clear` |
| `auth.js` | `app/src/sync/auth.js` | PKCE-флоу: `login(issuer, clientId, redirectUri)` — генерація code verifier/challenge, redirect; `handleCallback(url)` — обмін коду на токени через token endpoint з OIDC discovery |
| `client.js` | `app/src/sync/client.js` | `startSync()` (WebSocket, desktop), `pullOnce()` (HTTP pull, Android), `pushMutation(type, payload)` з JWT Bearer token |

### Інші ключові JS-модулі

| Модуль | Файл | Відповідальність |
| --- | --- | --- |
| `link-store.js` | `app/src/link-store.js` | OPFS (`links.json`); схема `{ version, linksSeq, items: [{ id, url, createdAt, deleted }] }`; міграція зі старого `string[]`; `appendLink`, `removeLink`, `listLinkRecords`, `_applyRemoteLinkMutation`, `_lastSyncedSeq` / `_setLastSyncedSeq` |
| `opfs.js` | `app/src/opfs.js` | Спільний OPFS-хелпер; `readJsonFile` / `writeJsonFile` над `navigator.storage.getDirectory()` |
| `translation-cache.js` | `app/src/translation-cache.js` | `localStorage['translation_cache_v1']`; записи `{ model, originalLang, segments: [{ original, translated }], deleted, updatedAt }`; `removeTranslation`, `_applyRemoteTranslationMutation`, `_lastSyncedSeq` / `_setLastSyncedSeq` |
| `caption-langs.js` | `app/src/caption-langs.js` | `captionStatus(langs)` → `{ kind: 'uk' \| 'en' \| 'none', langs }`; нормалізація `uk-UA`→`uk`, `en-US`→`en`; `loadLangsCache` / `saveLangsCache` (ключ `'yt:langs'`); кеш не має TTL |
| `ollama.js` | `app/src/ollama.js` | `translateToUkrainian({ onProgress })`; `chunkText` (чанки ≤3500 символів по `\n`); `resolveModel` (дефолт `DEFAULT_MODEL = 'aya-expanse:8b'`, fallback — перша з `GET /api/tags`); параметри: `temperature: 0.2`, `num_ctx: 8192`, `keep_alive: '5m'` |
| `model-pref.js` | `app/src/model-pref.js` | `loadModelPref(storage)`, `saveModelPref(model, storage)`; ключ `'myshare.ollamaModel'` |
| `youtube.js` | `app/src/youtube.js` | `getYoutubeLanguages(videoId)` — обгортка над `yt_list_languages`; `extractYoutubeVideoId(url)` — клієнтський URL-парсинг |
| `page-meta.js` | `app/src/page-meta.js` | Отримання title / description / favicon для не-YouTube посилань через HTTP |
| `omlx.js` | `app/src/omlx.js` | `listOmlxModels()` — `GET http://127.0.0.1:8000/v1/models`; desktop-only (omlx MLX-сервер) |

---

## Relay-сервер myshare (`relay/`)

Relay — окремий Bun workspace-член (`relay/package.json`), легкий self-hosted sync-сервер. WS для desktop (persistent-з'єднання), HTTP push/pull для Android.

| Модуль | Файл | Відповідальність |
| --- | --- | --- |
| `server.js` | `relay/src/server.js` | Bun HTTP/WS сервер; маршрутизація на `router.js` |
| `router.js` | `relay/src/router.js` | REST-ендпоінти `pull` / `push` та WS-апгрейд; перевіряє JWT через `auth.js` |
| `auth.js` | `relay/src/auth.js` | JWT-верифікація через `jose.createRemoteJWKSet` проти Hydra JWKS; OIDC discovery `<issuer>/.well-known/openid-configuration` |
| `sync.js` | `relay/src/sync.js` | Append-only merge за server-assigned `seq`; tombstones (`deleted` прапор); окремі `seq`-лічильники для `links` і `translations` |
| `db.js` | `relay/src/db.js` | `bun:sqlite` під Bun-рантаймом; `node:sqlite` під vitest/Node (ідентичний sync API) |

---

## Конфігурація myshare

### `app/src-tauri/tauri.conf.json`

| Секція | Призначення |
| --- | --- |
| `bundle.identifier: "com.vitaliytv.myshare"` | iOS/Android bundle ID |
| `plugins.deep-link.schemes: ["myshare"]` | Обробка `myshare://oauth/callback` — PKCE OAuth callback |
| `app.windows` | Визначення головного вікна (ширина, висота, декорації, заголовок) |

### `app/src-tauri/capabilities/default.json`

| URL-дозвіл | Призначення |
| --- | --- |
| `http://localhost:11434/**`, `http://127.0.0.1:11434/**` | Ollama API (переклад субтитрів EN→UA); задані явно, бо wildcard `http://**` не матчить нестандартні порти в Tauri URLPattern |
| `http://127.0.0.1:8000/v1/**` | omlx MLX-сервер (tool-calling LLM на desktop) |
| `deep-link:default` | OAuth deep-link callback (`myshare://oauth/callback`) |
| `http://**`, `https://**` | Supadata API, relay-сервер, OIDC discovery |

### Env vars

| Змінна | Де визначається | Призначення |
| --- | --- | --- |
| `SUPADATA_API_KEY` | `app/src-tauri/src/youtube.rs` (hardcoded, free-tier) | API-ключ для supadata (YouTube transcript / languages); при ротації — оновити константу й перебілдити |
| Relay URL | Runtime — `SyncSettings.vue` → `localStorage` | URL self-hosted relay-сервера |
| Ory issuer URL | Runtime — `SyncSettings.vue` → `localStorage` | Ory Hydra issuer для OIDC discovery |

### OAuth-клієнт Ory Hydra

- Тип: public client, `token_endpoint_auth_method: none`
- PKCE обов'язковий (`code_challenge_method: S256`)
- `redirect_uri`: `myshare://oauth/callback`
- Реєстрація: ручний `hydra create client` проти `nitra/ory` — команда та застереження щодо прапорців у `relay/README.md`

---

## Operations myshare

### Локальна розробка

```sh
# Встановлення залежностей (root workspace)
bun install

# Desktop dev (Tauri + Vite HMR)
bun run tauri dev

# Android dev
bun run android
```

### Збірка

```sh
# macOS app bundle
bun run tauri build

# Android APK
bun run tauri android build
```

### Тести

```sh
# JS-тести (vitest, root workspace)
bun test

# Rust unit-тести
cargo test --manifest-path app/src-tauri/Cargo.toml

# Relay-тести
cd relay && bun test
```

Поточне покриття: 126+ JS-тестів, 10 Rust-тестів — усі зелені.

### Lint

```sh
# Delta-lint змінених файлів vs origin
npx @nitra/cursor lint

# Full lint (глобальна черга, один прогін на машину)
npx @nitra/cursor lint --full

# JS/Vue напряму
bun run lint
```

### Relay — запуск локально

```sh
cd relay && bun src/server.js
```

---

## Тести myshare

| Модуль | Файл тесту |
| --- | --- |
| `app/src/link-store.js` | `app/src/link-store.test.js` |
| `app/src/translation-cache.js` | `app/src/translation-cache.test.js` |
| `app/src/caption-langs.js` | `app/src/caption-langs.test.js` |
| `app/src/youtube.js` | `app/src/youtube.test.js` |
| `app/src/ollama.js` | `app/src/ollama.test.js` |
| `app/src/tool/catalog.js`, `dispatch.js`, `manifest.js`, `scope.js` | `app/src/tool/tool.test.js` |
| `app/src/tool/llm.js` | `app/src/tool/llm.test.js` |
| `app/src/sync/device-id.js` | `app/src/sync/device-id.test.js` |
| `app/src/sync/session-store.js` | `app/src/sync/session-store.test.js` |
| `app/src/sync/auth.js` | `app/src/sync/auth.test.js` |
| `app/src/sync/client.js` | `app/src/sync/client.test.js` |
| `relay/src/db.js` | `relay/src/db.test.js` |
| `relay/src/sync.js` | `relay/src/sync.test.js` |
| `relay/src/auth.js` | `relay/src/auth.test.js` |
| `app/src-tauri/src/youtube.rs` | TBD: `app/src-tauri/tests/` |
