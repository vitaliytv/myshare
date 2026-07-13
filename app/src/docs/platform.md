---
type: JS Module
title: platform.js
resource: app/src/platform.js
docgen:
  crc: 2569c692
  model: openai-codex/gpt-5.4-mini
  tier: cloud-min
  score: 100
---

## Огляд

Файл дає два способи відрізнити Android: за переданим user agent і за поточним середовищем виконання. Він потрібен, щоб інші частини системи могли окремо працювати з Android-клієнтом і Android-платформою, не повторюючи цю перевірку в різних місцях.

## Поведінка

- `isAndroidUserAgent` — визначає, чи переданий user agent належить Android.
- `isAndroidPlatform` — визначає, чи поточне середовище запуску працює на Android; якщо `navigator` відсутній, повертає `false`.

## Публічний API

- isAndroidUserAgent — перевіряє, чи значення user agent містить ознаки Android
- isAndroidPlatform — перевіряє, чи значення platform містить ознаки Android

Гарантії:

- read-only: не пише у ФС чи БД

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
