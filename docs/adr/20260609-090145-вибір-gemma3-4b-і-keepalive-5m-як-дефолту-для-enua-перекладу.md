---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-09T09:01:45+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

## ADR Вибір `gemma3:4b` і `keep_alive:'5m'` як дефолту для EN→UA перекладу субтитрів

## Context and Problem Statement
Модуль перекладу субтитрів у `myshare` (`app/src/ollama.js`) потребував дефолтної моделі та політики утримання в пам'яті. Попередня конфігурація (`DEFAULT_MODEL = 'gemma4:e4b'`, `keep_alive: 0`) на машині з 16 GB RAM спричиняла своп (~15 GB) і повторне завантаження моделі між чанками.

## Considered Options
* `gemma3:4b` (3.3 GB на диску, 4.4 GB у RAM)
* `gemma4:e4b` (9.6 GB на диску, 10.6 GB у RAM) — попередній дефолт
* Спеціалізовані мультимовні моделі: `aya-expanse:8b`, `aya:8b`, `command-r7b:latest` (~6.4–6.8 GB у RAM)

## Decision Outcome
Chosen option: "`gemma3:4b` з `keep_alive:'5m'`", because бенчмарк на субтитрах Rick Astley (2089 символів) показав 37.5 tok/s і адекватну якість при споживанні лише 4.4 GB RAM — без свопу на 16 GB. `aya-expanse:8b`/`command-r7b` давали нижчу якість (неправильний рід, відмінок, кальки, `goodbye` лишалось по-англійськи) при 6.4–6.8 GB. `gemma4:e4b` — найкраща якість, але 10.6 GB RAM провокувало своп, що унеможливлювало щоденне використання. `keep_alive:'5m'` замість `0` прибирає перезавантаження моделі між чанками одного перекладу.

### Consequences
* Good, because transcript фіксує очікувану користь: переклад повного тексту займає ~14s без свопу; `ollama ps` підтвердив 4.4 GB / 100% GPU; якість Ukrainian перекладу перевірено наживо (`Ми не чужинці коханню ♪`).
* Bad, because якість поступається `gemma4:e4b` у дрібних деталях (плутанина особи дієслова, напр. `віддам` → `підведемо`).

## More Information
Змінено `DEFAULT_MODEL` і `keep_alive` у `app/src/ollama.js`; видалено функцію `unloadModel`. Модель запускається через `http://localhost:11434` (Ollama), параметри `num_ctx:8192`, `temperature:0.2`. Тест: `curl http://localhost:11434/api/ps` для замірів RAM. Спеціалізовані MT-моделі NLLB-200/MADLAD-400 несумісні з Ollama (seq2seq encoder-decoder).

---

## ADR Агентний `/n-fix` через pi.dev: хмарні моделі замість локальних

## Context and Problem Statement
Команда дослідила, чи можна запускати агентний скіл `n-fix` (багатокроковий цикл bash/read/edit/write із самоперевіркою через `npx @nitra/cursor fix`) з локальними моделями через pi.dev + Ollama, замість хмарних. Тест охопив 7 локальних і 3 хмарні моделі на ідентичному наборі порушень (10 ❌: `yarn.lock`, `prettier` у devDeps, відсутній скрипт `lint-image`).

## Considered Options
* Локальні моделі через Ollama (qwen2.5-coder:7b, granite3.3:8b, llama3.1:8b, qwen3:8b, deepseek-coder-v2:16b, gemma4:e2b, gemma4:e4b)
* Хмарні моделі через openai-codex OAuth (gpt-5.4-mini, gpt-5.5)

## Decision Outcome
Chosen option: "хмарні моделі для агентних скілів", because жодна локальна не закрила задачу (найкраща — qwen3:8b — знизила 10→7 за 600с із timeout і новим порушенням), тоді як gpt-5.4-mini і gpt-5.5 обидві досягли 10→0 (повне виправлення), незважаючи на 20–72 помилки інструментів у процесі, завдяки циклу відновлення.

### Consequences
* Good, because transcript фіксує очікувану користь: gpt-5.4-mini (106 tool-викликів, 20 помилок, after=0) і gpt-5.5 (116 викликів, 72 помилки, after=0) — обидві довели до нуля при тому самому стенді.
* Bad, because хмарні моделі витрачають ChatGPT-підписку (реальні токени); обидві впираються в timeout 600с через `bun i`/`oxfmt` у пісочниці.

## More Information
Стенд: `rsync` повна копія репо (node_modules симлінком), шлях `…/.worktrees/run-fix` (обхід worktree-preflight скіла), інжект порушень, `pi --provider <P> --model <M> --mode json /skill:n-fix`, реверифікація `npx @nitra/cursor fix`. Watchdog 600с (macOS, без `timeout`). Три рівні провалу локальних моделей задокументовано нижче.

---

## ADR Три рівні провалу локальних моделей в агентному циклі

## Context and Problem Statement
Після отримання результатів тесту n-fix проведено глибший аналіз причин: чому навіть coding-спеціалізовані локальні моделі (qwen2.5-coder:7b) не змогли виконати агентний цикл. Гіпотезу «перевантаження контексту» перевірено raw-тестом.

## Considered Options
* Гіпотеза A: перевантаження контексту (великий системний промпт скіла «витісняє» інструкції щодо tool-calling)
* Гіпотеза B: розсинхрон Ollama-template ↔ вивід моделі (незалежно від контексту)
* Гіпотеза C: Q4-квантизація псує структурований вивід

## Decision Outcome
Chosen option: "Гіпотеза B підтверджена (template-десинхрон) як Шар A; Шари B і C — окремі незалежні причини", because raw-тест (`/tmp/tooltest.py`) показав: `qwen2.5-coder:7b` через нативний Ollama `/api/chat` **і** через `/v1` (OpenAI-compat) однаково видає tool-виклик у `content` як голий JSON замість структурованого `tool_calls` — без жодного системного промпта. Гіпотеза A спростована (6/6 спроб = 0 структурованих викликів навіть на тривіальному промпті).

### Consequences
* Good, because transcript фіксує очікувану користь: локалізація причини дає конкретний roadmap покращень (правка Modelfile-template, вища квантизація, коротший системний промпт) — зафіксовано в `docs/explanation/local-llm-evaluation.md` розділ TODO.
* Bad, because Neutral, because transcript не містить підтвердження наслідку щодо того, чи покращення template вирішить питання повністю.

## More Information
Три задокументовані рівні: **Шар A** — template-десинхрон у Ollama-пакеті (qwen2.5-coder, granite3.3: модель емітує `{"name":"read",...}` у content без `<tool_call>`-токенів; deepseek-coder-v2 взагалі без tools у своєму Modelfile). **Шар B** — відсутність циклу відновлення: gemma4:e4b (36 edit + 35 bash, 17 помилок, 10→14 — зламала package.json до невалідного JSON) і gemma4:e2b (1 read, передчасний стоп, 10→10). **Шар C** — некомпетентність на конкретній задачі: qwen3:8b додала заборонений `oxfmt` у devDependencies (нове порушення), `lint-image` — з неправильними прапорами (не прочитала `image-compress.mdc`). Документ: `docs/explanation/local-llm-evaluation.md` (commit `4b2fd62`).

---

## ADR Підключення Ollama до pi.dev через `~/.pi/agent/models.json`

## Context and Problem Statement
Для тестування локальних моделей через pi.dev (агентний CLI) потрібно було зареєструвати Ollama як провайдер — pi не має вбудованого Ollama-провайдера, але підтримує custom providers.

## Considered Options
* `OPENAI_BASE_URL` env-змінна (нативна для OpenAI-сумісних проксі)
* `~/.pi/agent/models.json` з ключем `providers.ollama` (задокументований pi-механізм)

## Decision Outcome
Chosen option: "`~/.pi/agent/models.json`", because `OPENAI_BASE_URL` ігнорується pi (запит пішов на справжній OpenAI, отримав 401); `models.json` — єдиний задокументований шлях (`docs/models.md` у пакеті pi). Використано `api: "openai-completions"`, `baseUrl: "http://localhost:11434/v1"`, `apiKey: "ollama"`, `maxContext: 32768`.

### Consequences
* Good, because transcript фіксує очікувану користь: `pi --list-models ollama` видав обидві зареєстровані моделі; ping `PONG` пройшов без помилок.
* Bad, because схема `cost` у `models.json` вимагає всі 4 поля (`input`, `output`, `cacheRead`, `cacheWrite`); неповна схема дає `Invalid models.json schema` і моделі не з'являються в pi.

## More Information
Файл: `~/.pi/agent/models.json`. Ключові поля: `compat.supportsDeveloperRole: false`, `compat.supportsReasoningEffort: false`. Ollama запущено з `OLLAMA_CONTEXT_LENGTH=32768` для агентних задач. Провайдер `openai-codex` (ChatGPT OAuth) — єдиний хмарний у `~/.pi/agent/auth.json`; `gpt-5.3-codex` недоступна на ChatGPT-акаунті (потребує API-ключ).
