---
session: ac62b1d9-3159-4158-abdd-721502f63409
captured: 2026-06-15T10:09:11+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/ac62b1d9-3159-4158-abdd-721502f63409.jsonl
---

---

## ADR Перехід з Ollama на omlx (OpenAI-compatible MLX) для перекладу субтитрів

## Context and Problem Statement

Застосунок `myshare` використовував `app/src/ollama.js` для перекладу YouTube-субтитрів EN→UA через `POST http://localhost:11434/api/chat` (Ollama-специфічний протокол). Паралельний проєкт `nitra/task` вже мігрував той самий сценарій на `omlx` — OpenAI-compatible MLX сервер на `http://127.0.0.1:8000/v1`. Виникло рішення привести `myshare` до тієї самої точки.

## Considered Options

* Залишити Ollama (`localhost:11434`, Ollama-протокол `/api/chat`)
* Перейти на omlx (`127.0.0.1:8000/v1`, OpenAI-compatible `/v1/chat/completions`)

## Decision Outcome

Chosen option: "Перейти на omlx", because проєкт `nitra/task` вже використовує той самий OpenAI-compatible протокол, нативний MLX швидший на Apple Silicon, і уніфікація зменшує розбіжності між проєктами.

### Consequences

* Good, because transcript фіксує очікувану користь: уніфікація з `nitra/task`, стандартний OpenAI-compatible API `/v1/chat/completions`, усі 99 тестів зелені після міграції.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Видалено: `app/src/ollama.js`, `app/src/ollama.test.js`
- Створено: `app/src/omlx.js` (`OMLX_BASE_URL = 'http://127.0.0.1:8000/v1'`, `DEFAULT_MODEL = 'gemma-4-e4b-it-OptiQ-4bit'`), `app/src/omlx.test.js` (21 тест)
- Оновлено: `app/src-tauri/capabilities/default.json` — дозволи `localhost:11434/*` → `localhost:8000/*` та `127.0.0.1:8000/*`
- Оновлено: `app/src/model-pref.js` — `STORAGE_KEY`: `'myshare.ollamaModel'` → `'myshare.omlxModel'`
- Оновлено: `app/src/App.vue` — імпорт `listOmlxModels`, `omlxModels`, текст «Переклад через omlx»
- Довідка: `nitra/task/app/src/composables/use-omlx.js`, `nitra/task/app/src-tauri/src/lib.rs` (`omlx_config`)

---

## ADR Структура документації `docs/` замість `README.md`

## Context and Problem Statement

Проєкт `myshare` мав єдиний `README.md` у корені репозиторію. Правило `n-ci4.mdc` вимагає вести документацію у форматі arc42 + Diátaxis + MADR v4 у каталозі `docs/` з автогенерованими проекціями та ручними зонами. `README.md` не відповідає цій структурі.

## Considered Options

* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Перенести зміст `README.md` у `docs/` і видалити `README.md`", because це пряма вимога правила `n-ci4.mdc`, яке є обов'язковим для проєкту.

### Consequences

* Good, because transcript фіксує очікувану користь: каркас arc42 / Diátaxis піднято, AUTOGEN-зони з хешами готові до першої регенерації, glossary слугує вхідним контекстом для LLM-промптів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Видалено: `README.md`
- Створено: `docs/explanation/overview.md`, `docs/explanation/architecture.md` (arc42, C4 Mermaid), `docs/explanation/strategy.md`, `docs/explanation/components/.gitkeep`, `docs/how-to/run.md`, `docs/reference/.gitkeep`, `docs/snapshots/.gitkeep`, `docs/adr/index.md`, `docs/glossary.md`, `docs/.docgen/config.yaml`, `docs/.docgen/manifest.json`, `docs/.docgen/prompts/projection.md`
- Усі AUTOGEN-зони мають маркери `start`/`end` з `hash="sha256:pending"`

---

## ADR Зберігання прийнятих посилань як масиву (`myshare.sharedUrls`) замість одного запису

## Context and Problem Statement

Застосунок `myshare` приймає посилання через Android Share intent і відображав лише останнє отримане посилання. Виникла потреба зберігати прийняті посилання у локальному сховищі між сесіями. Потрібно було вибрати між збереженням одного (останнього) запису та збереженням повної історії.

## Considered Options

* Зберігати останнє посилання в існуючому ключі `myshare.sharedText`
* Зберігати масив посилань у новому ключі `myshare.sharedUrls`

## Decision Outcome

Chosen option: "Зберігати масив посилань у новому ключі `myshare.sharedUrls`", because користувач явно вибрав варіант 2 (масив/історія) після того, як асистент описав обидва варіанти.

### Consequences

* Good, because transcript фіксує очікувану користь: всі 16 тестів зелені після реалізації; UI показує `q-list` усіх прийнятих URL; новий модуль `url-history.js` із валідацією malformed JSON / non-array / non-string entries.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Створено: `app/src/url-history.js` (`STORAGE_KEY = 'myshare.sharedUrls'`, функції `loadUrlHistory`, `saveUrlHistory`, `appendUrlToHistory`; найсвіжіший запис — індекс 0)
- Створено: `app/src/url-history.test.js` (11 тестів з mock storage)
- Оновлено: `app/src/App.vue` — `onMounted` читає історію, на подію `myshare:android-share` додає URL на початок масиву і зберігає в `localStorage`
- Оновлено: `docs/explanation/architecture.md` — `ContainerDb Local Storage`, Runtime View кроки 5–6, Crosscutting-секція
- Створено: `docs/explanation/components/url-history.md`
