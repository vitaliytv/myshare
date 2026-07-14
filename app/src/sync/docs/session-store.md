---
type: JS Module
title: session-store.js
resource: app/src/sync/session-store.js
docgen:
  crc: d2877be8
  model: openai-codex/gpt-5.4-mini
  score: 50
  issues: no-overview,short-behavior,anchor-miss:session.json,best-of-2:retry-lost
---

## Гарантії поведінки

- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- За певних помилок повертає порожнє значення (напр. `null`) замість винятку.
