# System Context — myshare

## Призначення myshare

`myshare` — кросплатформний застосунок на базі Tauri (Android + macOS desktop), призначений для одного власника. Застосунок `myshare` отримує URL-посилання через Android Share intent, накопичує їх у хронологічному журналі та синхронізує між пристроями через self-hosted relay. Для YouTube-відео застосунок `myshare` показує наявність субтитрів, дозволяє читати транскрипти та перекладати англійські субтитри в українську мову за допомогою локальної LLM.

Застосунок `myshare` усуває проблему розкиданих «цікавих посилань»: замість пересилань у месенджерах чи браузерних закладок, недоступних з іншого пристрою, усі URL опиняються в єдиному синхронізованому журналі з контентом YouTube просто у застосунку.

## Користувачі myshare

Застосунок `myshare` розрахований на одного власника — людину, яка одночасно користується Android-смартфоном і macOS-ноутбуком. Цілі користувача застосунку `myshare`:

- зберегти посилання «на потім» одним тапом через стандартний Android Share, не перемикаючись із поточного контексту;
- переглянути накопичений список посилань на будь-якому пристрої у будь-який час;
- ознайомитися зі змістом YouTube-відео за субтитрами без переходу на YouTube;
- отримати переклад англійських субтитрів українською мовою через локальну LLM без хмарних витрат;
- прибрати оброблені або нерелевантні посилання, синхронізувавши видалення на всіх пристроях.

## Зовнішні системи myshare

### Зовнішня система `Ory Hydra` myshare

`Ory Hydra` — OAuth2-авторизаційний сервер зі спільного стеку `nitra/ory` (Kratos + Hydra). Зовнішня система `Ory Hydra` надає застосунку `myshare` JWT-токени для автентикації перед relay-сервером `myshare`.

Межі довіри та scopes:

- Клієнт `myshare` зареєстрований у `Ory Hydra` як публічний (`token_endpoint_auth_method: none`, PKCE); `redirect_uri: myshare://oauth/callback` — нативний deep-link Tauri.
- Застосунок `myshare` використовує Authorization Code + PKCE flow; OAuth2 endpoints визначаються через OIDC discovery (`<issuer>/.well-known/openid-configuration`).
- Клієнтський секрет відсутній; автентичність підтверджується PKCE code verifier.

Операції застосунку `myshare` проти `Ory Hydra`:

- запит авторизаційного коду через browser-redirect із PKCE challenge;
- обмін коду на `access_token` та `refresh_token`;
- передача `access_token` у Bearer-заголовку всіх запитів до relay-сервера `myshare`.

### Зовнішня система `supadata` myshare

`supadata` — сторонній HTTP API для отримання метаданих субтитрів і транскриптів YouTube-відео. Зовнішня система `supadata` надає застосунку `myshare` список доступних мов субтитрів (`availableLangs`) і повний текст транскрипту. Free tier — 100 запитів на місяць.

Межі довіри та scopes:

- Відповіді `supadata` містять лише публічні дані YouTube.
- Квота захищається кешем у `localStorage` (ключ `yt:langs`): повторний запит по вже відомому `videoId` не надсилається.

Операції застосунку `myshare` проти `supadata`:

- легкий `GET /youtube/transcript?id=<videoId>` для отримання лише `availableLangs` без завантаження тексту;
- повний `GET /youtube/transcript?id=<videoId>` з параметрами мови для читання транскрипту.

### Зовнішня система `Ollama` myshare

`Ollama` — локальний LLM-рантайм на macOS desktop. Зовнішня система `Ollama` надає застосунку `myshare` можливість перекладати англійські субтитри YouTube в українську мову без зовнішніх API-ключів і хмарних витрат.

Межі довіри та scopes:

- HTTP POST до `http://localhost:11434` — локальний процес, дані не залишають пристрій.
- Tauri HTTP capability застосунку `myshare` містить явні дозволи `http://localhost:11434/**` та `http://127.0.0.1:11434/**`.
- На Android зовнішня система `Ollama` недоступна; кнопка «Перекласти» у застосунку `myshare` не відображається.

Операції застосунку `myshare` проти `Ollama`:

- `POST /api/chat` з дефолтною моделлю `aya-expanse:8b`, параметрами `temperature: 0.2`, `num_ctx: 8192`, `keep_alive: '5m'`; текст розбивається на чанки ≤3500 символів;
- `GET /api/tags` для отримання переліку встановлених моделей (fallback: перша з переліку, якщо дефолт відсутній).

### Зовнішня система `omlx / LiteRT-LM` myshare

`omlx` (MLX-сервер, OpenAI-сумісний) і `LiteRT-LM` — LLM-інференс для агентського tool-calling loop застосунку `myshare`. Зовнішня система `omlx / LiteRT-LM` надає застосунку `myshare` можливість виконувати інтелектуальні дії над посиланнями через LLM-агента.

Межі довіри та scopes:

- Desktop: `omlx` слухає на `http://127.0.0.1:8000/v1`, локальний процес.
- Android: `LiteRT-LM` — on-device інференс через Tauri-команду `litert_chat`, модель Gemma4-E2B; мережевих з'єднань не потребує.
- LLM-агент застосунку `myshare` отримує scope `write`: читання даних і запис мутацій, без деструктивних дій.

Операції застосунку `myshare` проти `omlx / LiteRT-LM`:

- `POST /v1/chat/completions` (omlx, desktop) або `invoke('litert_chat', ...)` (LiteRT, Android) у tool-calling loop `app/src/tool/llm.js`;
- `GET /v1/models` (omlx) для отримання переліку доступних моделей та UI-перемикача.

### Зовнішня система `relay-сервер` myshare

`relay-сервер` — self-hosted легкий Bun HTTP/WebSocket сервер (`relay/`), розгорнутий власником застосунку `myshare`. Зовнішня система `relay-сервер` синхронізує журнал посилань і кеш перекладів між Android і macOS desktop.

Межі довіри та scopes:

- `relay-сервер` верифікує Bearer JWT від `Ory Hydra` через `jose.createRemoteJWKSet` (JWKS endpoint Hydra); власних паролів і сесій не тримає.
- TLS є обов'язковим: Android 16+ блокує cleartext HTTP за замовчуванням.
- Усі авторизовані пристрої застосунку `myshare` мають рівний доступ до push/pull мутацій.

Операції застосунку `myshare` проти `relay-сервера`:

- Desktop: persistent WebSocket — push мутацій і отримання нових записів у реальному часі;
- Android: HTTP push (`POST /sync/links`, `POST /sync/translations`) та pull (`GET /sync/links?after=<seq>`);
- tombstone-видалення: поле `deleted: true` у записі журналу поширюється через relay на всі пристрої.

## Use-cases myshare

- Користувач `myshare` ділиться посиланням з іншого Android-застосунку через стандартний Share intent — застосунок `myshare` зберігає URL у OPFS-файлі `links.json`.

- Користувач `myshare` переглядає хронологічний список збережених посилань на Android або macOS desktop.

- Користувач `myshare` перевіряє наявність субтитрів YouTube-відео (UA / EN / немає) — статус відображається поряд із посиланням без додаткових мережевих запитів завдяки кешу `yt:langs` у `localStorage`.

- Користувач `myshare` відкриває діалог і читає транскрипт субтитрів YouTube-відео мовою оригіналу.

- Користувач `myshare` (macOS desktop) запускає переклад EN-субтитрів у українську через локальний `Ollama` — прогрес відображається у реальному часі; результат кешується у `localStorage`.

- Користувач `myshare` видаляє посилання — tombstone-запис синхронізується на всі пристрої через `relay-сервер`.

- Користувач `myshare` авторизується через `Ory Hydra` (PKCE flow) і налаштовує адресу relay у компоненті `SyncSettings` — після цього список посилань і кеш перекладів синхронізуються у фоні.

- Користувач `myshare` взаємодіє з LLM-агентом, який через уніфікований `tool`-шар (scope `write`) читає метадані сторінок і маніпулює посиланнями.

## Cross-cutting concerns myshare

**Приватність даних користувача `myshare`.** Посилання зберігаються в OPFS (`links.json`) — файлова система браузера, ізольована від інших застосунків. Кеш субтитрів (`yt:langs`) і кеш перекладів (`myshare.translations`) живуть у `localStorage` пристрою. Дані передаються лише на self-hosted `relay-сервер`, розгорнутий самим власником. Жодних аналітичних або телеметричних запитів до третіх сторін немає.

**Зберігання токенів застосунку `myshare`.** `access_token` і `refresh_token` від `Ory Hydra` зберігаються у `app/src/sync/session-store.js` через `localStorage`. Токени передаються лише relay-серверу `myshare` у Bearer-заголовку.

**Межі довіри `myshare`.** LLM-агент застосунку `myshare` отримує scope `write` (читання + мутації посилань); людина-користувач — scope `destructive` (включно з незворотнім видаленням). `relay-сервер` не тримає власних прав доступу — делегує довіру `Ory Hydra`.

**TLS.** З'єднання з `relay-сервером` застосунку `myshare` вимагає TLS — Android 16+ відхиляє cleartext HTTP без явної мережевої конфігурації безпеки.

**Мова інтерфейсу.** Українська.

**Підтримувані платформи.** Android (Share intent, HTTP sync, on-device LiteRT-LM — planned) і macOS desktop (Tauri, Ollama переклад, omlx агент, WebSocket sync).

## Поточний стан myshare

### Реалізовано

- Прийом URL через Android Share intent і зберігання в OPFS (`app/src/link-store.js`, формат `links.json` v1 із полями `id`, `url`, `createdAt`, `deleted`).
- Хронологічний журнал посилань із deduplicated-append і tombstone-видаленням.
- Статус субтитрів YouTube (`app/src/caption-langs.js`, Tauri-команда `yt_list_languages`, кеш у `localStorage` з ключем `yt:langs`).
- Отримання транскрипту YouTube через `supadata` (`app/src/youtube.js`, Rust-команда `yt_get_transcript`).
- Переклад EN→UA через `Ollama` (`app/src/ollama.js`, дефолт `aya-expanse:8b`, кеш у `app/src/translation-cache.js`).
- UI-перемикач Ollama-моделі (`app/src/model-pref.js`, `<q-select>` у toolbar `App.vue`).
- Метадані вебсторінки (`app/src/page-meta.js`).
- Уніфікований `tool`-шар (`app/src/tool/catalog.js`, `dispatch.js`, `manifest.js`, `scope.js`, `llm.js`).
- LLM-агент desktop через `omlx` (`createOpenAiChat`) і JS-адаптер `createLiteRtChat` для Android (очікує Rust-команду).
- Self-hosted relay з append-only seq-журналом і tombstone-видаленням (`relay/src/server.js`, `db.js`, `sync.js`, `auth.js`).
- OAuth2/PKCE авторизація через `Ory Hydra` (`app/src/sync/auth.js`).
- Sync-клієнт WebSocket (desktop) і HTTP (Android) (`app/src/sync/client.js`).
- Компонент `SyncSettings.vue` для налаштування relay URL і Ory issuer.
- Deep-link `myshare://oauth/callback` для OAuth callback (`tauri-plugin-deep-link`).

### Planned

- Rust Tauri-команда `litert_chat` і бандлинг LiteRT-LM рантайму з моделлю Gemma4-E2B для on-device LLM-агента на Android (JS-адаптер `createLiteRtChat` вже реалізовано).
- Реєстрація OAuth2-клієнта `myshare` у `Ory Hydra` (public, PKCE, `redirect_uri: myshare://oauth/callback`) — одноразовий ops-крок поза кодом застосунку.
