---
type: Rust Module
title: youtube.rs
resource: app/src-tauri/src/youtube.rs
docgen:
  crc: 2766dc55
  model: openai-codex/gpt-5.5
  score: 45
  issues: no-overview,short-behavior,anchor-miss:https://api.supadata.ai,anchor-miss:https://example.com,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- За певних помилок повертає порожнє значення (напр. `null`) замість винятку.
