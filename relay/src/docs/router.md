---
type: JS Module
title: router.js
resource: relay/src/router.js
docgen:
  crc: 12ac29a4
  model: openai-codex/gpt-5.5
  tier: cloud-avg
  score: 45
  issues: no-overview,short-behavior,anchor-miss:req.json,anchor-miss:Response.json,best-of-2:retry-lost
---

## Гарантії поведінки

- Перехоплює помилки і не пропускає винятків назовні (fail-safe).
