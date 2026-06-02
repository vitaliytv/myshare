---
session: b6945133-f665-442c-bdf4-8b4c18c186df
captured: 2026-06-02T16:35:19+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/b6945133-f665-442c-bdf4-8b4c18c186df.jsonl
---

## ADR Переміщення `@stryker-mutator/*` з кореневого `package.json` до `app/`

## Context and Problem Statement
У кореневому `package.json` монорепо були присутні `@stryker-mutator/core` і `@stryker-mutator/vitest-runner` у `devDependencies`. Правило `bun.mdc` дозволяє у кореневих `devDependencies` лише пакети `@nitra/*`, а для Vitest/Stryker-піру — тільки як виняток для `n-cursor coverage` (а не як загальні devDeps кореня).

## Considered Options
* Перемістити `@stryker-mutator/core` і `@stryker-mutator/vitest-runner` до `app/package.json`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Перемістити `@stryker-mutator/core` і `@stryker-mutator/vitest-runner` до `app/package.json`", because правило `bun.mdc` явно вимагає, щоб кореневі `devDependencies` містили лише `@nitra/*`-модулі; тестові раннери (Stryker/Vitest) належать до workspaceу `app`, де вони безпосередньо використовуються.

### Consequences
* Good, because кореневий `package.json` залишається мінімальним і відповідає `bun.mdc`; dep resolution у hoisted Bun monorepo стає явно прив'язаною до workspace, що використовує ці пакети.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Зміни у файлах: `package.json` (видалено `@stryker-mutator/core@^9.6.1`, `@stryker-mutator/vitest-runner@^9.6.1`), `app/package.json` (додано ті самі пакети). Перевірка правила: `npx @nitra/cursor fix bun`. Правило: `.cursor/rules/n-bun.mdc`, канон у `@nitra/cursor/rules/bun/bun.mdc`.

---

## ADR Канонічний склад правил у `.oxlintrc.json` (e18e + ignorePatterns)

## Context and Problem Statement
Файл `.oxlintrc.json` не містив чотирьох `e18e/prefer-array-*` правил зі статусом `"deny"` і мав неповний список `ignorePatterns`. Перевірка `npx @nitra/cursor fix js-lint` зафіксувала відхилення від canonical oxlint-конфігурації `@nitra/cursor`.

## Considered Options
* Синхронізувати `.oxlintrc.json` з `oxlint-canonical.json` пакету `@nitra/cursor`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Синхронізувати `.oxlintrc.json` з `oxlint-canonical.json` пакету `@nitra/cursor`", because джерелом істини є canonical-файл `/Users/vitalii/.npm/_npx/.../node_modules/@nitra/cursor/scripts/utils/oxlint-canonical.json`; відхилення від нього порушує правило `js-lint.mdc`.

### Consequences
* Good, because transcript фіксує очікувану користь: lint виявляє анти-патерни масивів (`prefer-array-fill`, `prefer-array-to-reversed`, `prefer-array-to-sorted`, `prefer-array-to-spliced`) у коді проєкту; всі js-lint перевірки переходять до ✅.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Додані правила: `e18e/prefer-array-fill`, `e18e/prefer-array-to-reversed`, `e18e/prefer-array-to-sorted`, `e18e/prefer-array-to-spliced` — всі `"deny"`. Оновлено `ignorePatterns`: додано `"npm/types/**"` і `"demo/node/rules-demo.js"`. Одночасно підвищено `@nitra/eslint-config` з `^3.9.4` до `^3.10.0` у `package.json`. Canonical джерело: `@nitra/cursor` → `scripts/utils/oxlint-canonical.json`.

---

## ADR Створення `.vscode/settings.json` з прив'язками форматерів

## Context and Problem Statement
Файл `.vscode/settings.json` був відсутній у репозиторії (присутній у `.gitignore` як виняток з glob `!.vscode/settings.json`). Правила `ga.mdc` і `text.mdc` вимагають наявності цього файлу з конкретними прив'язками `editor.defaultFormatter` для мовних блоків, щоб гарантувати однорідне форматування у VS Code для усіх учасників.

## Considered Options
* Створити `.vscode/settings.json` з canonical форматерами згідно з шаблонами `@nitra/cursor`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Створити `.vscode/settings.json` з canonical форматерами згідно з шаблонами `@nitra/cursor`", because `npx @nitra/cursor fix ga` і `fix-text` зафіксували відсутність файлу як порушення; шаблони знаходяться у `@nitra/cursor/rules/ga/policy/vscode_settings/template/settings.json.snippet.json` і аналогічних для `text`, `style-lint`.

### Consequences
* Good, because transcript фіксує очікувану користь: правила `ga`, `text`, `style-lint` переходять до ✅; VS Code використовуватиме `oxc.oxc-vscode` для `[github-actions-workflow]` та визначені форматери для CSS/SCSS/Markdown.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл `.vscode/settings.json` зберігається в git (виняток у `.gitignore`: рядок 25 — `!.vscode/settings.json`). Canonical шаблон: `@nitra/cursor/rules/ga/policy/vscode_settings/template/settings.json.snippet.json` → `{ "[github-actions-workflow]": { "editor.defaultFormatter": "oxc.oxc-vscode" } }`. Одночасно до `.vscode/extensions.json` додано `"arr.marksman"` (вимога `ci4.mdc`).
