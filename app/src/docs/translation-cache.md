---
type: JS Module
title: translation-cache.js
resource: app/src/translation-cache.js
docgen:
  crc: 2bce4f77
  model: openai-codex/gpt-5.4-mini
  score: 45
  issues: no-overview,short-behavior,anchor-miss:STORAGE_KEY,anchor-miss:SEQ_STORAGE_KEY,best-of-2:retry-lost
---

## Гарантії поведінки

- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
- Кешує результати в межах одного прогону.
