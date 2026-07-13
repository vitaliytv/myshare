---
type: Rust Module
title: youtube.rs
resource: app/src-tauri/src/youtube.rs
docgen:
  crc: 0fc64baf
  model: openai-codex/gpt-5.5
  tier: cloud-avg
  score: 45
  issues: no-overview,short-behavior,anchor-miss:https://api.supadata.ai,anchor-miss:https://example.com,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- За певних помилок повертає порожнє значення (напр. `null`) замість винятку.
