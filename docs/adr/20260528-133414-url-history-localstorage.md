# Збереження отриманих URL як масив у localStorage (url-history)

**Status:** Accepted
**Date:** 2026-05-28

## Context and Problem Statement

Застосунок `myshare` приймає посилання через Android Share intent, але не зберігав їх між сесіями. Постало питання — зберігати лише останнє посилання або повну хронологічну історію у локальному сховищі пристрою.

## Considered Options

- Варіант 1: одне посилання в існуючому ключі `myshare.sharedText`
- Варіант 2: масив посилань у новому ключі `myshare.sharedUrls`

## Decision Outcome

Chosen option: "Варіант 2 — масив `myshare.sharedUrls`", because користувач обрав цей варіант явно в діалозі; зберігається повна хронологія посилань із дедуплікацією та лімітом 100 записів.

### Consequences

- Good, because користувач бачить усі прийняті посилання, а не лише останнє; нова URL додається на початок масиву (індекс 0) — список хронологічно відсортований без додаткового сортування.
- Bad, because transcript не містить підтвердженого механізму автоматичного очищення записів понад ліміт 100 між сесіями.

## More Information

- `app/src/url-history.js` — `appendUrlToHistory`, `loadUrlHistory`, `saveUrlHistory`; ключ `STORAGE_KEY = 'myshare.sharedUrls'`; JSON-масив рядків; дедуплікація (нова URL іде на початок, старий запис видаляється); ліміт 100.
- `app/src/url-history.test.js` — 9 unit-тестів (mock `localStorage`-об'єкт з `getItem`/`setItem`); покривають порожнє сховище, JSON-помилки, дедуплікацію, ліміт.
- `app/src/App.vue` — `onMounted` читає `loadUrlHistory(localStorage)`; обробник події `myshare:android-share` викликає `appendUrlToHistory` і `saveUrlHistory`; шаблон розширено до `q-list` з `q-item` для кожного URL.
- `docs/explanation/components/url-history.md` — компонентна документація.

## More Information

Додаткової інформації в transcript не зафіксовано.

## Update 2026-05-28

Додаткові деталі реалізації: `url-history.js` валідує malformed JSON, non-array і non-string entries. Тест-сюїт розширено до 11 vitest-тестів; загалом 16 тестів у 2 файлах включно з `shared-url.test.js`. Документацію оновлено: `docs/explanation/architecture.md` (Building Block `ContainerDb`, Runtime View кроки 5–6), `docs/glossary.md` (терміни `Local Storage`, `URL History`).
