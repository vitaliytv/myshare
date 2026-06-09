# Виправлення проєкту під правила @nitra/cursor (/n-fix)

**Status:** Accepted
**Date:** 2026-06-02

## Context and Problem Statement

Проєкт `myshare` накопичив розбіжності з правилами `@nitra/cursor` у кількох областях: `.oxlintrc.json` не містив обов'язкових `e18e/*` правил і канонічних `ignorePatterns`; відсутній `.vscode/settings.json` з `editor.defaultFormatter` для GitHub Actions; `@stryker-mutator`/`vitest` залежності були не там, де вимагають `bun.mdc` та `vue.mdc`; версія `@nitra/eslint-config` була нижчою за мінімально допустиму.

## Considered Options

- Виправлення через worktree-ізольований `/n-fix` скіл з подальшим переносом до `main` через `git apply --3way`
- Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Виправлення через worktree-ізольований `/n-fix` скіл", because `SKILL.md` вимагає запуску виключно у `.worktrees/<branch>-fix/`, а всі виправлення зводилися до синхронізації з канонічними baseline-файлами `@nitra/cursor`.

### Consequences

- Good, because `npx @nitra/cursor fix` повертає exit 0 — всі правила без зауважень після перенесення змін до `main`.
- Bad, because `git apply --3way` дав конфлікт у `docs/explanation/components/youtube.md` (файл мав локальні зміни, не пов'язані з fix); довелося відновити оригінал через `git checkout HEAD`.

## More Information

Змінені файли:
- `.vscode/extensions.json` — додано `arr.marksman`
- `.vscode/settings.json` — створено (налаштування `editor.defaultFormatter` по мовах)
- `.oxlintrc.json` — додано `e18e/prefer-array-fill`, `e18e/prefer-array-to-reversed`, `e18e/prefer-array-to-sorted`, `e18e/prefer-array-to-spliced` та інші `e18e/*`; оновлено `ignorePatterns` до канонічних
- `package.json` (root) — `@nitra/eslint-config` bumped до `^3.10.0`; додано `vitest`, `@vitest/coverage-v8`, `@stryker-mutator/vitest-runner` до root `devDependencies`; доданий script `"test": "vitest run"`
- `app/package.json` — прибрані `vitest`, `@vitest/coverage-v8`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/core` (переміщені до root)
- `app/.changes/`, `scripts/.changes/` — створені change-файли (`npx @nitra/cursor change`)
- `bunx oxfmt .` — форматування 131 файлу
