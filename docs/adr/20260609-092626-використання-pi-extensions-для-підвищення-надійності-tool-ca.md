---
session: eec457d3-1708-4dbc-afa6-721d9bdf6138
captured: 2026-06-09T09:26:26+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/eec457d3-1708-4dbc-afa6-721d9bdf6138.jsonl
---

Тепер маю повну картину API. Коротка відповідь: **частково — і саме там, де це найцінніше**.

## Що реально можна зробити через pi extensions

### 1. `Response.transform` — фіксує Шар A (TEXT → structured tool_calls)

**Найбільший виграш.** Перехоплює відповідь моделі ДО того, як pi її обробляє. Можна детектувати `{"name":"bash","arguments":{...}}` у тексті і «підняти» до справжнього tool_call:

```ts
Response.transform('fix-local-tool-calls', async (message) => {
// якщо content — рядок з JSON-викликом → конвертуємо у tool_calls
const match = message.content?.match(/^\s*\{"name":"(\w+)","arguments":({.*?})\s*$/s)
if (match) {
return { ...message, content: '', tool_calls: [{ name: match[1], arguments: JSON.parse(match[2]) }] }
}
return message
})
```

Це **безпосередньо виправляє проблему qwen2.5-coder і granite** — raw-тест показав, що вони правильно *генерують* структуру, але Ollama-template її не витягує. Transform підхоплює те, що template пропустив.

---

### 2. `ToolResult.transform` — додає навідні інструкції при помилках

Коли `edit` падає з «must have required properties oldText» — можна дописати до результату точну інструкцію:

```ts
ToolResult.transform('guide-on-error', async (result, ctx) => {
if (result.isError && result.content?.includes('must have required properties')) {
result.content += '\n\nВИКОРИСТОВУЙ ТОЧНО ТАК:\n{"oldText":"рядок який є у файлі","newText":"новий рядок"}'
}
return result
})
```

Це допомагає моделям, які **викликають**, але неточно (gemma4, llama) — підштовхує до правильного формату замість "вгадай знову".

---

### 3. `registerResolver(Trigger.Edit)` — захист від зламаного JSON

Перехоплює кожен edit-виклик, валідує JSON перед записом у `*.json`-файли, повертає помилку замість запису:

```ts
registerResolver(Trigger.Edit, async (data, next) => {
if (data.path.endsWith('.json')) {
const after = applyEdit(data)
try { JSON.parse(after) } catch (e) {
return { output: `❌ JSON зламається після правки: ${e.message}. Переформулюй.` }
}
}
return next(data)
})
```

Це **запобігає катастрофі gemma4:e4b** (10→14 були наслідком одного зламаного JSON що потягнув 5+ правил).

---

### 4. `registerProvider` — повний цикл відновлення

**Найскладніше, але повний контроль.** Через кастомний провайдер можна обгорнути Ollama і реалізувати петлю:

```
call model → parse tool_calls (з трансформами) → execute →
check result → якщо помилка → inject "try again: <error>" →
call model знову (до N разів) → recheck → ...
```

Це відтворює те, що роблять хмарні: «спробував → впав → скоригував → повторив». Але це вже **300+ рядків** TypeScript-провайдера — нетривіальна робота.

---

## Що ці засоби **не вирішують**

- **Відсутність само-перевірки**: навіть якщо tool-виклики спрацьовують, модель не знає «а тепер запусти `npx fix` і поглянь чи ще є ❌» — це вже стратегічна когерентність, а не механіка. Тут треба або `custom command` «verify-fix», або явна інструкція в скілі.
- **Q4-дрейф наприкінці довгого контексту**: transform допомагає на початку, але не відновлює когерентність, яка втрачається на 50-100 токенах context window.

---

## Пріоритет реалізації

| Крок | Механізм | Що вирішує | Складність |
|---|---|---|---|
| 1 | `Response.transform` | qwen2.5-coder/granite text→tool_calls | ~30 рядків |
| 2 | `ToolResult.transform` | навідні помилки | ~20 рядків |
| 3 | `Resolver(Edit)` + JSON-валідація | запобігає gemma4-катастрофі | ~25 рядків |
| 4 | `registerProvider` + retry-петля | повний цикл відновлення | ~300+ рядків |

Кроки 1–3 можна зробити як `.pi/extensions/local-llm-compat/index.ts` за ~2 год і **одразу повторити тест** — результат покаже, чи це знімає Шар A і пом'якшує Шар B.

Хочеш — і розпочнемо з кроку 1 (найбільший impact при найменших зусиллях)?

---
---

Це містить достатньо нетривіальних рішень для ADR — сформулюю документ.

## ADR Використання pi extensions для підвищення надійності tool-calling локальних моделей Ollama

## Context and Problem Statement
Порівняльне тестування 9 локальних моделей через `pi + Ollama` на задачі агентного `/n-fix` показало два шари провалу: (Шар A) `qwen2.5-coder:7b` і `granite3.3:8b` емітують tool-виклики як plain-text замість структурованих `tool_calls`, бо Ollama-template не парсить їхній формат; (Шар B) моделі, що виклики все ж виконують (`gemma4:e4b`, `qwen3:8b`), не мають циклу відновлення після помилки і або здаються, або деструктивно гатять без сходження.

## Considered Options
* Реалізувати комплекс pi extensions: `Response.transform` для конвертації text→`tool_calls`, `ToolResult.transform` для навідних інструкцій при помилках схеми, `registerResolver(Trigger.Edit)` з JSON-валідацією перед записом, та `registerProvider` з повною retry-петлею.
* Залишити локальні моделі лише для генерації тексту (переклад) і агентні скіли виконувати виключно хмарними моделями.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Реалізувати комплекс pi extensions", because transcript визначив конкретні точки перехоплення, де кожен extension напряму адресує виміряну причину провалу: `Response.transform` усуває Шар A без змін до моделі чи Ollama; захисний `registerResolver(Edit)` запобігає каскаду, зафіксованому у `gemma4:e4b` (10→14 ❌ через зламаний `package.json`); пріоритизація кроків 1–3 (~75 рядків) дозволяє швидко перевірити гіпотезу повторним запуском наявного стенду (`/tmp/nfix_run2.sh` + інжектор).

### Consequences
* Good, because transcript фіксує очікувану користь: `Response.transform` безпосередньо усуває задокументований Шар A — raw-тест показав, що `qwen2.5-coder:7b` правильно *генерує* структуру виклику, але Ollama-template її не витягує; transform підхоплює саме це.
* Bad, because transcript не містить підтверджених негативних наслідків, але відзначає, що кроки 1–3 не вирішують стратегічної некогерентності моделей (відсутність само-перевірки і дрейф наприкінці довгого контексту залишаються відкритими гіпотезами).

## More Information
- Стенд для повторного тестування: `/tmp/nfix_run2.sh`, інжектор порушень у `/tmp/inject.sh`, події у `/tmp/events2_*.jsonl`.
- Точка перехоплення Шару A підтверджена raw-тестом: `curl http://localhost:11434/api/chat` і `http://localhost:11434/v1/chat/completions` обидва повертають `content: '{"name":"read_file","arguments":{...}}'` замість `tool_calls` для `qwen2.5-coder:7b`.
- Extension API pi: `Response.transform`, `ToolResult.transform`, `registerResolver(Trigger.Edit | Trigger.Bash | Trigger.Write)`, `registerProvider` — задокументовано у `~/.pi` та у `/opt/homebrew/Cellar/pi-coding-agent/0.78.0/libexec/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`.
- Метрики хмарного baseline: `gpt-5.4-mini` і `gpt-5.5` досягли 10→0 ❌ через цикл відновлення (106/116 tool-викликів, 20/72 помилок відповідно) — це орієнтир для локальних після впровадження extensions.
- Моделі в Ollama на момент дослідження: `gemma3:4b` (переклад, оптимум 16 GB), `qwen2.5-coder:7b` (candidate для агентного після extensions).
