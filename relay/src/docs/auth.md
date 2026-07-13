---
type: JS Module
title: auth.js
resource: relay/src/auth.js
docgen:
  crc: 4f5ce337
  model: openai-codex/gpt-5.5
  score: 50
  issues: no-overview,short-behavior,anchor-miss:jwks.json,best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Кешує результати в межах одного прогону.
