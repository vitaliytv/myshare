# Синхронізація конфігурацій проєкту з канонічними шаблонами @nitra/cursor

**Status:** Accepted
**Date:** 2026-06-02

## Context and Problem Statement

Декілька файлів конфігурації у проєкті `myshare` відхилялися від канонічних шаблонів `@nitra/cursor`: `@stryker-mutator/*` розміщувались у кореневих `devDependencies` всупереч правилу `bun.mdc`; `.oxlintrc.json` не містив чотирьох `e18e/prefer-array-*` правил зі статусом `"deny"` і мав неповний список `ignorePatterns`; `.vscode/settings.json` був відсутній, що порушувало правила `ga.mdc` та `text.mdc`.

## Considered Options

- Синхронізувати кожну конфігурацію з канонічним шаблоном `@nitra/cursor` (`npx @nitra/cursor fix <rule>`)
- Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Синхронізувати конфігурації з `@nitra/cursor`", because кожне порушення зафіксовано автоматичною перевіркою `npx @nitra/cursor fix`; канонічні шаблони є обов'язковим джерелом істини для правил `bun.mdc`, `js-lint.mdc`, `ga.mdc`, `text.mdc`.

### Consequences

- Good, because `@stryker-mutator/core` і `@stryker-mutator/vitest-runner` переміщено до `app/package.json`, де вони безпосередньо використовуються; oxlint виявляє антипатерни масивів (`prefer-array-fill`, `prefer-array-to-reversed`, `prefer-array-to-sorted`, `prefer-array-to-spliced`); VS Code використовує `oxc.oxc-vscode` для `[github-actions-workflow]` та визначені форматери для CSS/SCSS/Markdown.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

**Stryker (bun.mdc):** `package.json` — видалено `@stryker-mutator/core@^9.6.1`, `@stryker-mutator/vitest-runner@^9.6.1`; `app/package.json` — додано ті самі пакети. Правило: `.cursor/rules/n-bun.mdc`; канон: `@nitra/cursor/rules/bun/bun.mdc`.

**oxlint (js-lint.mdc):** `.oxlintrc.json` — додані правила `e18e/prefer-array-fill`, `e18e/prefer-array-to-reversed`, `e18e/prefer-array-to-sorted`, `e18e/prefer-array-to-spliced` (всі `"deny"`); `ignorePatterns` доповнено `"npm/types/**"` і `"demo/node/rules-demo.js"`; `@nitra/eslint-config` підвищено з `^3.9.4` до `^3.10.0`. Canonical джерело: `@nitra/cursor` → `scripts/utils/oxlint-canonical.json`.

**VS Code settings (ga.mdc, text.mdc):** `.vscode/settings.json` створено (файл відслідковується git — виняток у `.gitignore`: рядок 25 — `!.vscode/settings.json`). Canonical шаблон: `@nitra/cursor/rules/ga/policy/vscode_settings/template/settings.json.snippet.json`. До `.vscode/extensions.json` додано `"arr.marksman"` (вимога `ci4.mdc`).
