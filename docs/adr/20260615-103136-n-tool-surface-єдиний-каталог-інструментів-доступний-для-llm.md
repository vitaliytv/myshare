---
session: 40c9af33-c316-4040-bee4-ad2281ad7565
captured: 2026-06-15T10:31:36+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/40c9af33-c316-4040-bee4-ad2281ad7565.jsonl
---

## ADR n-tool-surface: єдиний каталог інструментів, доступний для LLM у myshare

## Context and Problem Statement

У `myshare` дії над посиланнями (витяг YouTube-транскрипту, метадані сторінки, переклад) були «розсипані» по модулях `youtube.js`, `page-meta.js`, `omlx.js` і викликалися inline у Vue-компонентах. Ні LLM, ні будь-який оркестратор не міг звернутися до них уніфіковано. Проєкт `nitra/task` вже реалізував паттерн `n-tool-surface` (каталог + dispatch + manifest + agent loop), і постала задача перенести ці ідеї в `myshare`.

## Considered Options

* Перенести паттерн `n-tool-surface` з `nitra/task`: єдиний `catalog.js`, `dispatch.js`, `manifest.js`, `scope.js`, `llm.js`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Перенести паттерн `n-tool-surface` з `nitra/task`", because архітектура `myshare` вже містила той самий стек (Tauri 2 + Vue 3 + omlx), а наявні модулі природно стали реалізаціями під іменованими tool-ами без зміни поведінки.

Специфічні відхилення від оригіналу `nitra/task`:

- **CLI-транспорт виключено**: у `myshare` один рантайм (WebView), окремий headless-бінарник (`bin/task.mjs`) не потрібен; залишені лише UI-транспорт (Tauri `invoke`) і LLM-транспорт.
- **Platform-aware LLM-шар**: desktop → `createOmlxChat` (HTTP до `omlx` на `:8000`), Android → `createLiteRtChat` (Tauri-команда `litert_chat`, модель LiteRT-LM / Gemma4-E2B). Селектор `createChat({ android })` вибирає адаптер автоматично через `isAndroidPlatform()`.
- **Tiers спрощено до `read`/`write`** (без `destructive`, бо руйнівних дій у `myshare` не передбачено).

### Consequences

* Good, because transcript фіксує очікувану користь: `dispatch(name, input)` повертає уніфікований конверт `{ok, output}` / `{ok, error}` — UI і `runAgent` клич тим самим шляхом.
* Good, because 26 нових тестів пройшли з першого запуску (`bunx vitest run src/tool/ --root app`), повний сьют (125 тестів) зелений.
* Good, because production-файли `app/src/tool/` пройшли `bunx eslint` без errors.
* Bad, because Tauri-команда `litert_chat` на стороні Rust ще не реалізована — LiteRT-LM / Gemma4-E2B на Android є наступним кроком за межами цього changeset'у.

## More Information

Нові файли:
- `app/src/tool/catalog.js` — масив `TOOLS`: `transcript`, `languages`, `page_meta`, `translate`
- `app/src/tool/dispatch.js` — `createDispatch(transport)`, конверт `{ok, output|error}`
- `app/src/tool/manifest.js` — `toolManifest()` → OpenAI function-calling shape
- `app/src/tool/scope.js` — `scopedManifest(actor)`, `guardDispatch(dispatch, actor)`, `allowsTier(actor, tier)`
- `app/src/tool/llm.js` — `createOmlxChat`, `createLiteRtChat`, `createChat`, `runAgent`
- `app/src/tool/index.js` — публічний re-export
- `app/src/tool/tool.test.js`, `app/src/tool/llm.test.js`

Команди верифікації:
```
bunx vitest run src/tool/ --root app
bunx eslint app/src/tool
```
