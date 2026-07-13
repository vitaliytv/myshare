# Рішення MLMaiL — зведення ADR-впливів на C4-модель

## Хронологічний індекс ADR MLMaiL

| slug | дата | статус | summary |
| --- | --- | --- | --- |
| [20260528-133151-структура-документації-n-ci4](../adr/20260528-133151-структура-документації-n-ci4.md) | 2026-05-28 | Accepted | Структура документації на основі n-ci4.mdc із міграцією README.md |
| [20260528-133414-url-history-localstorage](../adr/20260528-133414-url-history-localstorage.md) | 2026-05-28 | Accepted | Збереження отриманих URL як масив у localStorage (url-history) |
| [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) | 2026-06-02 | Accepted | Статус субтитрів YouTube через availableLangs + localStorage-кеш |
| [20260602-163519-nitra-cursor-config-compliance](../adr/20260602-163519-nitra-cursor-config-compliance.md) | 2026-06-02 | Accepted | Синхронізація конфігурацій проєкту з канонічними шаблонами @nitra/cursor |
| [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) | 2026-06-02 | Accepted | Ollama для перекладу EN→UA субтитрів (desktop-only) |
| [20260602-165315-n-fix-виправлення-під-правила-nitra-cursor](../adr/20260602-165315-n-fix-виправлення-під-правила-nitra-cursor.md) | 2026-06-02 | Accepted | Виправлення проєкту під правила @nitra/cursor (/n-fix) |
| [20260603-134252-ollama-вибір-моделі-перекладу](../adr/20260603-134252-ollama-вибір-моделі-перекладу.md) | 2026-06-03 | Accepted | Вибір Ollama-моделі aya-expanse:8b для перекладу субтитрів EN→UA |
| [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) | 2026-06-15 | Accepted | n-tool-surface: бекенд-дії myshare, доступні для LLM через каталог і dispatch |
| [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) | 2026-07-12 | Accepted | Desktop↔Android синхронізація посилань і перекладів через self-hosted relay + Ory OAuth2/PKCE |
| [index](../adr/index.md) | — | meta | Автогенерований індекс accepted ADR myshare (autogen, без дати рішення) |

## Вплив ADR на рівні C4 MLMaiL

| slug | 01-context | 02-containers | 03-components | 04-code |
| --- | --- | --- | --- | --- |
| [20260528-133151-структура-документації-n-ci4](../adr/20260528-133151-структура-документації-n-ci4.md) | — | — | — | — |
| [20260528-133414-url-history-localstorage](../adr/20260528-133414-url-history-localstorage.md) | — | ✓ | ✓ | ✓ |
| [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) | ✓ | ✓ | ✓ | ✓ |
| [20260602-163519-nitra-cursor-config-compliance](../adr/20260602-163519-nitra-cursor-config-compliance.md) | — | — | — | — |
| [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) | ✓ | ✓ | ✓ | ✓ |
| [20260602-165315-n-fix-виправлення-під-правила-nitra-cursor](../adr/20260602-165315-n-fix-виправлення-під-правила-nitra-cursor.md) | — | — | — | — |
| [20260603-134252-ollama-вибір-моделі-перекладу](../adr/20260603-134252-ollama-вибір-моделі-перекладу.md) | — | — | ✓ | ✓ |
| [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) | ✓ | ✓ | ✓ | ✓ |
| [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) | ✓ | ✓ | ✓ | ✓ |

## Зворотний індекс

### 01-context

ADR, що визначили контекстну діаграму MLMaiL (зовнішні системи, актори, межі системи):

- [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) — supadata API як зовнішня система для переліку мов субтитрів YouTube MLMaiL
- [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) — Ollama як зовнішня локальна LLM-система (desktop-only, `localhost:11434`) у контексті MLMaiL
- [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) — omlx (OpenAI-compatible MLX) і LiteRT-LM (on-device Gemma4-E2B) як LLM-провайдери у контекстному колі MLMaiL
- [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) — relay-сервер і Ory Hydra як зовнішні системи; Android-актор у контексті синхронізації MLMaiL

### 02-containers

ADR, що визначили контейнерну діаграму MLMaiL (сховища даних, сервіси, підсистеми):

- [20260528-133414-url-history-localstorage](../adr/20260528-133414-url-history-localstorage.md) — localStorage (`myshare.sharedUrls`) як контейнер-сховище URL-history MLMaiL (схема перенесена до OPFS `link-store.js` у ADR `relay-sync-cherez-ory-oauth2-pkce`)
- [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) — localStorage-кеш мов субтитрів (ключ `yt:langs`) як окремий контейнер даних MLMaiL
- [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) — Ollama HTTP-сервіс (`localhost:11434`) і localStorage-кеш перекладів (`translation_cache_v1`) як контейнери MLMaiL
- [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) — шар `app/src/tool/` як підсистема інструментів MLMaiL, що об'єднує UI і LLM-агент в одному WebView-рантаймі
- [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) — relay-сервер (`relay/`) як новий контейнер-сервіс; OPFS `links.json` як сховище посилань; sync-підсистема (`app/src/sync/`) як контейнер-клієнт MLMaiL

### 03-components

ADR, що визначили компонентну діаграму MLMaiL (JS-модулі, Vue-компоненти, Rust-команди):

- [20260528-133414-url-history-localstorage](../adr/20260528-133414-url-history-localstorage.md) — компонент `url-history.js` MLMaiL (функції `appendUrlToHistory`, `loadUrlHistory`, `saveUrlHistory`; логіка дедуплікації та ліміт 100 записів перенесені до `link-store.js`)
- [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) — компоненти `caption-langs.js` і `youtube.js` MLMaiL; Rust-команда `yt_list_languages`
- [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) — компоненти `ollama.js` і `translation-cache.js` MLMaiL; UI-діалог порівняння EN↔UA в `App.vue`
- [20260603-134252-ollama-вибір-моделі-перекладу](../adr/20260603-134252-ollama-вибір-моделі-перекладу.md) — компонент `model-pref.js` MLMaiL; UI-перемикач моделі Ollama в `App.vue` (константа `DEFAULT_MODEL = 'aya-expanse:8b'`)
- [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) — компоненти `tool/catalog.js`, `tool/dispatch.js`, `tool/manifest.js`, `tool/llm.js`, `tool/scope.js` MLMaiL
- [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) — компоненти `sync/device-id.js`, `sync/session-store.js`, `sync/auth.js`, `sync/client.js` і Vue-компонент `SyncSettings.vue` MLMaiL; оновлена схема `link-store.js`

### 04-code

ADR, що визначили рівень коду MLMaiL (функції, константи, схеми даних, Rust-типи):

- [20260528-133414-url-history-localstorage](../adr/20260528-133414-url-history-localstorage.md) — схема `string[]` у `myshare.sharedUrls`; функції `appendUrlToHistory`/`loadUrlHistory`/`saveUrlHistory`; ліміт 100 записів і дедуплікація
- [20260602-162030-статус-субтитрів-youtube](../adr/20260602-162030-статус-субтитрів-youtube.md) — функції `captionStatus`/`loadLangsCache`/`saveLangsCache`; нормалізація `uk-UA`→`uk` і `en-US`→`en`; ключ `yt:langs` у localStorage MLMaiL
- [20260602-163928-ollama-переклад-субтитрів](../adr/20260602-163928-ollama-переклад-субтитрів.md) — функції `translateToUkrainian`/`chunkText`/`resolveModel`; запис кешу `{model, originalLang, segments:[{original, translated}]}`; параметри `temperature: 0.2`, `num_ctx: 8192`, `keep_alive: '5m'`; Tauri capability `localhost:11434`
- [20260603-134252-ollama-вибір-моделі-перекладу](../adr/20260603-134252-ollama-вибір-моделі-перекладу.md) — константа `DEFAULT_MODEL = 'aya-expanse:8b'` у `app/src/ollama.js`; функції `loadModelPref`/`saveModelPref` у `app/src/model-pref.js`
- [260615-1030-n-tool-surface-llm-доступний-шар](../adr/260615-1030-n-tool-surface-llm-доступний-шар.md) — масив `TOOLS` з полями `{tier, name, summary, input, run}`; функції `createDispatch`/`toolManifest`/`listTools`/`runAgent`/`selectChat`/`guardDispatch`; конверт `{ok, output}` / `{ok, error: {code}}`
- [relay-sync-cherez-ory-oauth2-pkce](../adr/relay-sync-cherez-ory-oauth2-pkce.md) — схема `links.json` `{version, linksSeq, items:[{id, url, createdAt, deleted}]}`; функції `_applyRemoteLinkMutation`/`_lastSyncedSeq`/`_setLastSyncedSeq`; PKCE-flow `myshare://oauth/callback`; relay seq-based append-only merge

## Superseded chains

Жоден ADR MLMaiL не має формального статусу `Superseded`. Зафіксоване одне часткове заміщення без зміни статусу:

`20260528-133414-url-history-localstorage` → `relay-sync-cherez-ory-oauth2-pkce`

ADR `20260528-133414-url-history-localstorage` MLMaiL описував збереження URL у localStorage за ключем `myshare.sharedUrls` через модуль `url-history.js`. Модуль `url-history.js` замінено на OPFS-базований `link-store.js` 19 червня 2026 без окремого ADR; ADR `relay-sync-cherez-ory-oauth2-pkce` MLMaiL фіксує цю зміну заднім числом і вводить нову схему `{version, linksSeq, items:[{id, url, createdAt, deleted}]}`. Статус `20260528-133414-url-history-localstorage` лишається `Accepted`, оскільки ключові дизайн-рішення (масив із дедуплікацією й лімітом 100 записів) перенесено до `link-store.js`, а не скасовано.
