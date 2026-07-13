---
type: JS Module
title: vitest.config.js
resource: scripts/vitest.config.js
docgen:
  crc: d32a8e2d
  model: openai-codex/gpt-5.5
  tier: cloud-avg
  score: 50
  issues: no-overview,short-behavior,anchor-miss:(test.mdc),best-of-2:retry-lost
---

## Гарантії поведінки

- Read-only: не виконує операцій запису (ФС/БД).
- Свідомо пропускає шляхи: `node_modules`.
