**Status:** Accepted
**Date:** 2026-06-15

# n-tool-surface: бекенд-дії myshare, доступні для LLM

## Context and Problem Statement

У myshare дії над посиланнями (витяг YouTube id, список мов субтитрів, транскрипт, метадані сторінки, переклад EN→UA) живуть у фронтенд-модулях (`app/src/youtube.js`, `app/src/page-meta.js`, `app/src/omlx.js`) і викликаються inline з обробників в `App.vue`. Такий виклик досяжний лише через UI-взаємодію — його не може виконати LLM-агент.

Споріднений проєкт `nitra/task` розв'язав це правилом **n-tool-surface**: будь-яка дія мусить бути виконуваною як іменований `tool` зі схемою, до якого однаково дотягуються UI, скриптовий оркестратор і LLM. Постало питання — чи перенести цей підхід у myshare і в якому обсязі.

## Considered Options

- **Перенести n-tool-surface повністю як у task** — каталог + dispatch + маніфест + LLM-агент + CLI-транспорт (spawn бінарника) + MCP.
- **Перенести ядро без CLI/MCP** — каталог + dispatch + маніфест + scope + LLM-агент; кожен tool несе власний `run(input)`, бо в myshare один рантайм (WebView), без окремого процесу-оркестратора.
- **Не переносити** — лишити логіку inline, а LLM-доступ нарощувати ad hoc у кожному місці.

## Decision Outcome

Обрано **перенесення ядра без CLI/MCP**. Створено шар `app/src/tool/`:

- `catalog.js` — єдине джерело правди: масив `TOOLS`, кожен `{ tier, name, summary, input, run }`. Хендлер `run(input)` делегує в наявні модулі — ті самі функції, що кличе UI. Tool'и: `youtube_id`, `languages`, `transcript`, `page_meta` (read), `translate` (write).
- `dispatch.js` — `createDispatch(transport)` з валідацією схеми й уніфікованим конвертом `{ ok, output }` / `{ ok, error: { code } }`. Дефолтний transport — локальний виклик `tool.run`; готовий `dispatch` експортується для in-app споживачів.
- `manifest.js` — `toolManifest(allow)` (OpenAI function-calling форма) і `listTools()`, похідні від каталогу.
- `scope.js` — trust tiers `read < write < destructive`; `allowsTier`, `scopedManifest(actor)`, `guardDispatch(dispatch, actor)`. Людина — до `destructive`, агент — до `write`.
- `llm.js` — `runAgent` (tool-calling loop) + два chat-адаптери: `createOpenAiChat` (omlx на desktop) і `createLiteRtChat` (LiteRT-LM на Android, Gemma4-E2B, через Tauri-команду `litert_chat`), плюс `selectChat({ android })`, що обирає адаптер за платформою.

Відмінності від `nitra/task`, навмисні:

- **Без CLI-транспорту.** У myshare немає окремого процесу-оркестратора; UI і LLM-агент працюють в одному WebView. Тому транспорт не різниться per-consumer, а хендлер живе прямо в каталозі (`run`), а не як ім'я Tauri-команди + argv-білдер.
- **LLM-адаптер platform-aware.** Desktop використовує omlx (OpenAI-compatible MLX, `http://127.0.0.1:8000/v1`); на телефоні localhost-сервера немає, тож мобільний інференс іде через on-device LiteRT-LM з Gemma4-E2B.

### Consequences

- Логіка лишається в одному місці (наявні модулі), а каталог додає схему й LLM-досяжність — UI і агент звертаються до однієї реалізації, без дублювання.
- `App.vue` мігровано на `dispatch`: `ensureMeta` → `page_meta`, `ensureCaptionLangs` → `languages`, `openCaptionDialog`/`openTranslateDialog` → `transcript`, переклад → `translate`. UI лише розпаковує конверт `{ok, output|error}` замість try/catch. `extractYoutubeVideoId` лишився прямим (чистий клієнтський парсинг; tool `youtube_id` існує для агента), `listOmlxModels` — інфра вибору моделі, не доменна дія.
- Прогрес-бар перекладу (callback `onProgress`) не серіалізується в JSON-схему, тож `dispatch(name, input, ctx)` отримав необов'язковий `ctx` для in-app афордансів (`onProgress`, `signal`). LLM-шлях `ctx` не передає, маніфест його не бачить.
- Нова руйнівна дія автоматично стане human-only завдяки `tier`/scope без правок у споживачах.
- Покрито тестами: `app/src/tool/tool.test.js` (каталог, dispatch, ctx, маніфест, scope) і `app/src/tool/llm.test.js` (agent loop, обидва chat-адаптери, selectChat). Повний сьют — 126 тестів зелені; `vite build` проходить.
- **Незакрите:** Rust-команда `litert_chat` і бандлинг LiteRT-LM рантайму/моделі Gemma4-E2B ще не реалізовані — `createLiteRtChat` поки лише JS-сім (виклики reject'аться як «команда не знайдена», доки команду не додано). MCP-обгортка над каталогом у scope не входила.

## More Information

Першоджерело підходу — `nitra/task`: `app/src/tool/{catalog,dispatch,manifest,llm,scope}.js` і `docs/adr/260614-1803-уніфікований-командний-інтерфейс-n-tool-surface.md`. Вибір локальної моделі для desktop — наявний omlx-флоу (`app/src/omlx.js`). Інші варіанти (повний порт із CLI/MCP) свідомо відкладені до появи потреби в headless-оркестраторі.
