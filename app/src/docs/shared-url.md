---
type: JS Module
title: shared-url.js
resource: app/src/shared-url.js
docgen:
  crc: adc04182
  model: openai-codex/gpt-5.4-mini
  tier: cloud-min
  score: 50
  issues: no-overview,short-behavior,anchor-miss:PENDING_SHARED_TEXT_STORAGE_KEY,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- За певних помилок повертає порожнє значення (напр. `null`) замість винятку.
