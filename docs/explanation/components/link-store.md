# Component: Link Store

Модуль `link-store` зберігає посилання, прийняті через Android Share, в origin-private file
system (OPFS) пристрою — і на desktop, і на Android. Користувач бачить накопичений список
посилань між запусками застосунку; той самий сховище є єдиним джерелом правди і для UI, і для
LLM-агентських інструментів `list_links`/`add_link`, і для sync-клієнта (`components/sync-client`).

## Engineer: реалізація модуля `link-store`

- Файл: `app/src/link-store.js`. Сховище: OPFS, файл `links.json` (замінив `localStorage['myshare.sharedUrls']`/`url-history.js` 19 червня 2026 — сама заміна довго не мала ADR, зафіксована заднім числом разом із sync-фічею, [ADR relay-sync-cherez-ory-oauth2-pkce](../../adr/relay-sync-cherez-ory-oauth2-pkce.md)).
- Формат на диску: `{ version: 2, linksSeq: number, items: [{ id, url, createdAt, deleted }] }`. `id` — `crypto.randomUUID()`, `createdAt` — `Date.now()` у мс, `deleted` — tombstone-прапор (запис фізично не видаляється).
- Публічний API: `listLinks()` (`string[]`, non-deleted, newest-first за `createdAt`), `addLink(url)` (дедуп за точним співпадінням URL серед non-deleted), `removeLink(url)` (tombstone), `listLinkRecords()` (повні записи для sync-шару), `_applyRemoteLinkMutation({id,url,deleted,createdAt,seq})` (ідемпотентний upsert-by-id для вхідних мутацій з relay, не через `addLink`/`removeLink` — інакше мутація зациклилась би назад у push-чергу), `_lastSyncedSeq()`/`_setLastSyncedSeq(seq)` (курсор relay-журналу, зберігається в тому ж `links.json`).
- In-memory fallback (`let memory`), коли OPFS недоступний (component-тести, старі webview) — та сама поведінка API, без персистентності між запусками.
- Міграція старого формату: `Array.isArray(parsed)` (старий `string[]`) синтезує `items` зі свіжими `id` і descending `createdAt` (щоб зберегти порядок «найновіший перший»), одразу перезаписує у новій формі — точна історична дата створення кожного посилання не відновлюється (відоме обмеження).
- Підключення: `app/src/App.vue` — `onMounted` читає `listLinks()`, `handleAndroidShare` викликає `addLink`, нова кнопка видалення — `handleRemoveLink` → `removeLink`; після кожної локальної мутації запис пушиться в relay через `app/src/sync/client.js`'s `pushLinkMutation`.

## Ops: що моніторити

- OPFS-квота на Android WebView більша за `localStorage`, але не безмежна — стежити за помилками запису у логах, якщо список посилань виросте на порядки.
- Дублікати URL можливі, якщо той самий лінк додано offline на двох пристроях до першого sync (різні `id`, локальний дедуп лише по точному рядку) — задокументоване обмеження, не помилка.

## Тести

- `app/src/link-store.test.js` — vitest: in-memory fallback (prepend/dedupe/ignore-invalid), `removeLink` tombstone, ідемпотентність `_applyRemoteLinkMutation`, міграція старого `string[]`-формату через мокнутий OPFS.
