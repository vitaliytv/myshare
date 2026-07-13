---
type: JS Module
title: vitest.config.js
resource: relay/vitest.config.js
docgen:
  crc: 45d3dba4
  model: omlx/gemma-4-e4b-it-OptiQ-4bit
  tier: local-min-retry
  score: 100
---

## Огляд

Огляд: Конфігурує фреймворк Vitest, визначаючи область застосування тестів та умови їх виконання. У цьому файлі задаються параметри, що керують процесом тестування, включаючи специфікації файлів, які підлягають перевірці.

## Поведінка

I need to generate the "Behavior" section for the documentation of `/Users/vitalii/www/vitaliytv/myshare/relay/vitest.config.js`. I will write a concise, numbered algorithmic description in Ukrainian, focusing on *what* the file does and *why*, adhering to strict formatting constraints (no preamble, no markdown headings, no signatures/types/params, etc.).

The file configures Vitest for testing. Key aspects are handling Bun built-ins, defining test inclusion/exclusion, and setting the environment/pool.

I will use the `@cursor/skills/n-doc-files/SKILL.md` logic for generating documentation, but applying the specific stylistic rules provided in the prompt.

The resulting content should be the body of the "Поведінка" section.

Here is the content I will generate:

1. Конфігурує тестовий фреймворк Vitest.
2. Забезпечує коректну обробку вбудованих компонентів Bun, зокрема `bun:sqlite`, дозволяючи їх імпортуватися в тестовому середовищі без ручного перехоплення.
3. Визначає області, які підлягають тестуванню, включаючи всі файли з розширеннями `.test.{js,mjs}`.
4. Ігнорує шляхи в директоріях `node_modules` та `dist` під час пошуку тестових файлів.
5. Запускає тести у середовищі `node` та використовує пул процесів `forks` для паралелізму.

I will ensure the output is just the plain text content, as requested.

```python
# Simulate the action based on instructions
print
print
print
print
print
```1. Конфігурує тестовий фреймворк Vitest.
2. Забезпечує коректну обробку вбудованих компонентів Bun, зокрема `bun:sqlite`, дозволяючи їх імпортуватися в тестовому середовищі без ручного перехоплення.
3. Визначає області, які підлягають тестуванню, включаючи всі файли з розширеннями `.test.{js,mjs}`.
4. Ігнорує шляхи в директоріях `node_modules` та `dist` під час пошуку тестових файлів.
5. Запускає тести у середовищі `node` та використовує пул процесів `forks` для паралелізму.

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Свідомо пропускає шляхи: `node_modules`.
