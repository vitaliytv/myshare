---
type: JS Module
title: dispatch.js
resource: app/src/tool/dispatch.js
docgen:
  crc: 16c51eca
  model: openai-codex/gpt-5.4-mini
  tier: cloud-min
  score: 55
  issues: no-overview,short-behavior,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
