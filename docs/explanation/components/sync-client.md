# Component: Sync Client

Модуль `sync/` — desktop↔Android синхронізація посилань (`link-store`) і кешу перекладів
(`translation-cache`) через self-hosted `myshare-relay`, з логіном через спільний Ory-стек
(Kratos + Hydra). Користувач один раз логіниться через системний браузер на кожному пристрої —
далі нові/видалені посилання і переклади самі з'являються на іншому пристрої.

## Engineer: реалізація `app/src/sync/`

- **`device-id.js`** — `getDeviceId()`: стабільний `crypto.randomUUID()` на інсталяцію, персистить в OPFS (`device.json`). Використовується лише для echo-suppression в relay-журналі (не для авторизації).
- **`session-store.js`** — OPFS-сховище (`session.json`) поточної sync-сесії: `{relayUrl, oryIssuer, clientId, accessToken, refreshToken, idToken, expiresAt}`. `loadSession()`/`saveSession()`/`clearSession()`.
- **`auth.js`** — PKCE (RFC 7636) логін проти Ory Hydra OAuth2. `startLogin()` резолвить endpoints через OIDC discovery (`<issuer>/.well-known/openid-configuration` — не жорстко закодовані шляхи, бо dev-стек `ory` проксіює Hydra через login-ui nginx і може подвоювати `/oauth2` префікс), генерує PKCE-пару, відкриває системний браузер через `tauri-plugin-opener` (вже підключений плагін, новий Rust-код не знадобився). `listenForOAuthCallback()` реєструє `tauri-plugin-deep-link`'s `onOpenUrl` на схему `myshare://oauth/callback`, обмінює `code`+`code_verifier` на токени. `refreshIfNeeded()` рефрешить access token за ~60с до сплину TTL.
- **`client.js`** — sync-двигун:
  - Desktop (`!isAndroidPlatform()`): `startSync()` тримає один persistent `WebSocket` до `<relayUrl>/sync/ws`, перший фрейм — `hello` з JWT + курсорами `linksSince`/`translationsSince`; вхідні `catchup`/`push`/`push-ack` фрейми застосовуються назад через `_applyRemoteLinkMutation`/`_applyRemoteTranslationMutation`. Reconnect — exponential backoff 1s→30s.
  - Android: `pullOnce()` — одноразовий HTTP GET pull-since для обох таблиць, викликається при старті й на `visibilitychange`(visible); `pushLinkMutation`/`pushTranslationMutation` шлють HTTP POST одразу при локальній мутації.
  - Неуспішні push (обидві платформи) чергуються в OPFS-файл (`sync-queue.json`, з in-memory fallback) і ретраяться в `flushQueue()`.
  - `bootstrapIfNeeded()` — одноразовий full push усіх наявних локальних non-deleted записів, коли журнал користувача порожній (`_lastSyncedSeq() === 0`) — інакше дані, що існували до першого логіну, ніколи не потрапили б на relay.
  - Застосовані мутації генерують `CustomEvent(SYNC_UPDATED_EVENT)` (`myshare:sync-updated`) — той самий патерн, що `myshare:android-share`; `App.vue` перечитує `listLinks()`/`loadTranslations()` у відповідь.
- **`components/SyncSettings.vue`** — діалог: relay URL / Ory issuer / client ID, кнопка логіну (`startLogin`), статус (`не налаштовано`/`не увійшли`/`увійшли`), логаут (`stopSync` + `clearSession`).

## Ops: що моніторити

- Relay **має** бути за TLS — Android 16+ блокує cleartext HTTP/WS за замовчуванням, без винятків у конфігурації.
- Реєстрація Hydra OAuth2-клієнта `myshare` (public, PKCE, `redirect_uri: myshare://oauth/callback`) — одноразовий ручний ops-крок проти `/Users/vitalii/www/nitra/ory`, не автоматизований; команда — `relay/README.md`.
- Дублікати посилань можливі при offline-редагуванні на двох пристроях до першого sync (журнал мержить за `id`, не за `url`) — задокументоване обмеження, не помилка.
- `tauri-plugin-deep-link`'s `tauri.conf.json` схема має дві **незалежні** секції — `plugins.deep-link.desktop.schemes` (macOS/Windows/Linux custom URL scheme) і `plugins.deep-link.mobile` (масив `{scheme: [...]}`/`{host, ...}` — саме звідси генерується Android `<intent-filter>` в `AndroidManifest.xml`). Задання лише `desktop.schemes` компілюється без помилок, але залишає Android-маніфест без `intent-filter` для `myshare://` — виявлено лише реальною Android-збіркою (`bun run tauri android build`), не видно з `cargo check`. Обидві секції потрібні одночасно.

## Тести

- `app/src/sync/device-id.test.js`, `session-store.test.js`, `auth.test.js`, `client.test.js` — vitest, мокнуті `@tauri-apps/plugin-opener`/`plugin-deep-link`, `fetch`, `WebSocket`.
- `relay/src/{db,sync,auth}.test.js` — journal push/pull/tombstone/ізоляція між користувачами, JWT-верифікація проти локального JWKS.
- `cargo check`/`cargo clippy`/`cargo fmt --check` у `app/src-tauri` та реальна Android debug-збірка (`bun run tauri android build --apk --debug --target aarch64`) — перевірено, компілюється чисто, `AndroidManifest.xml` містить коректний `<intent-filter>` з `<data android:scheme="myshare" />`.
- Не покрито в цьому середовищі: реальний two-device sync на фізичному Android/desktop-вікні, реальний Ory login-flow із живим deep-link callback (потребує GUI/пристрою), реконект при справжніх мережевих обривах.
