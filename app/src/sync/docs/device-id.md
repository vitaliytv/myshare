---
type: JS Module
title: device-id.js
resource: app/src/sync/device-id.js
docgen:
  crc: 20f738e2
  model: openai-codex/gpt-5.4-mini
  score: 50
  issues: no-overview,short-behavior,anchor-miss:device.json,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- Кешує результати в межах одного прогону.
