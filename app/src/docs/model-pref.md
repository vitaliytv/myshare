---
type: JS Module
title: model-pref.js
resource: app/src/model-pref.js
docgen:
  crc: b82a044f
  model: openai-codex/gpt-5.4
  tier: cloud-avg
  score: 100
  judgeModel: openai-codex/gpt-5.4-mini
---

## Огляд

Файл визначає публічний API для збереження та відновлення вибору моделі `omlx`. `STORAGE_KEY="myshare.omlxModel"` — експортована string-константа, ключ для збереження вибору моделі. `loadModelPref` читає раніше збережений вибір моделі, а `saveModelPref` записує поточний вибір моделі за цим ключем. Це дає коду один узгоджений спосіб працювати з налаштуванням вибраної моделі.

## Поведінка

- `STORAGE_KEY` — рядкова константа `"myshare.omlxModel"`, яка задає ключ для збереження вибору моделі `omlx` між сесіями.
- `loadModelPref` — читає збережений вибір моделі зі storage і повертає непорожній рядок або `null`, якщо значення відсутнє чи storage недоступний.
- `saveModelPref` — зберігає непорожній рядок вибраної моделі у storage під ключем `STORAGE_KEY`, а якщо storage недоступний або значення порожнє, нічого не робить.

## Публічний API

- STORAGE_KEY="myshare.omlxModel" — рядковий ключ у `localStorage`, який позначає preference моделі.
- loadModelPref — читає preference моделі з `localStorage` за ключем `STORAGE_KEY`.
- saveModelPref — записує preference моделі в `localStorage` за ключем `STORAGE_KEY`.

## Гарантії поведінки

- (специфічних машинно-виведених гарантій немає)
