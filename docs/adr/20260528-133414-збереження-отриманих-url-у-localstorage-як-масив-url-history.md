---
session: ac62b1d9-3159-4158-abdd-721502f63409
captured: 2026-05-28T13:34:14+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/ac62b1d9-3159-4158-abdd-721502f63409.jsonl
---

[assistant]
Усі 16 тестів пройшли.

Зроблено:

- **`app/src/url-history.js`** — `appendUrlToHistory`, `loadUrlHistory`, `saveUrlHistory`, ключ `myshare.sharedUrls`, дедуплікація (нова URL іде на початок, старий запис видаляється), ліміт 100.
- **`app/src/url-history.test.js`** — 9 тестів покривають порожнє сховище, JSON-помилки, дедуплікацію, ліміт.
- **`app/src/App.vue`** — при `myshare:android-share` URL додається до масиву та зберігається у `localStorage`; на mount відновлюється попередня історія; UI показує `QList` з `QItem` для кожного URL.
- **`docs/`** — оновлено `architecture.md` (Building Block + Runtime View + Crosscutting), `glossary.md`, додано `docs/explanation/components/url-history.md`.

---

## ADR Збереження отриманих URL у localStorage як масив (url-history)

## Context and Problem Statement
Застосунок `myshare` приймає посилання через Android Share intent, але не зберігав їх між сесіями. Постало питання — зберігати лише останнє посилання (варіант 1) або повну історію (варіант 2).

## Considered Options
* Варіант 1: одне посилання в існуючому ключі `myshare.sharedText`
* Варіант 2: масив посилань у новому ключі `myshare.sharedUrls`

## Decision Outcome
Chosen option: "Варіант 2 — масив `myshare.sharedUrls`", because користувач обрав цей варіант явно в діалозі; зберігається повна хронологія посилань із дедуплікацією та лімітом 100 записів.

### Consequences
* Good, because transcript фіксує очікувану користь: користувач бачить усі прийняті посилання, а не лише останнє.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `app/src/url-history.js` — `appendUrlToHistory`, `loadUrlHistory`, `saveUrlHistory`
- `app/src/url-history.test.js` — 9 unit-тестів
- `app/src/App.vue` — підключення через `loadUrlHistory(localStorage)` та `saveUrlHistory(localStorage, ...)`
- `docs/explanation/components/url-history.md` — компонентна документація
