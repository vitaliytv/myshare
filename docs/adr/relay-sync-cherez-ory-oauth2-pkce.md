## ADR Desktop↔Android синхронізація посилань і перекладів через self-hosted relay + Ory OAuth2/PKCE

**Status:** Accepted
**Date:** 2026-07-12

## Context and Problem Statement

`myshare` зберігав список прийнятих посилань (`app/src/link-store.js`, OPFS `links.json`) і кеш
перекладів субтитрів (`app/src/translation-cache.js`, `localStorage['myshare.translations']`) лише
локально на кожному пристрої — desktop і Android ніяк не обмінювались даними. Потрібно було
вибрати: що синхронізувати, який транспорт/хостинг, модель мержу конфліктів і модель авторизації.

Дослідження показало, що спільний крейт `tauri-plugin-agent` (`github.com/nitra/tauri-components`)
не містить жодних sync/transport-примітивів — лише локальний журнал агентських запитів і читання
`~/.omlx/settings.json`. Також виявлено, що `docs/explanation/architecture.md` і два чернеткові ADR
(`20260528-133414-url-history-localstorage.md`, `20260605-093429-...localstorage.md`) досі описують
уже неактуальну схему localStorage/`url-history.js` — сам модуль замінено на OPFS/`link-store.js`
19 червня без окремого ADR; ця зміна фіксується цим документом заднім числом (див. `More Information`).

## Considered Options

* Власна email/password auth-таблиця в relay (register/login/session-токени в sqlite)
* Ory Hydra OAuth2 Authorization Code + PKCE (публічний native-клієнт), relay лише верифікує JWT — **обрано**
* Пряме перевикористання `jwt-bridge` з `/Users/vitalii/www/nitra/ory` (Hasura-специфічний, cookie-based)

## Decision Outcome

Chosen option: "Ory Hydra OAuth2 Authorization Code + PKCE", бо користувач явно попросив
авторизацію через спільний Ory-стек (`/Users/vitalii/www/nitra/ory`, Kratos + Hydra), той самий JWT
для Android, macOS і relay — не окрему email/password-схему і не pairing-код. `jwt-bridge`
відхилено: він Hasura-специфічний (жорсткі `x-hasura-*` claims) і працює лише через браузерну
cookie-сесію (`ory_kratos_session`), тому непридатний для headless relay чи native-клієнта без
браузерного контексту.

Узгоджені продуктові рішення, зафіксовані цим ADR:

* **Обсяг синхронізації:** посилання (`link-store.js`) + кеш перекладів (`translation-cache.js`),
  не вибір omlx-моделі.
* **Транспорт:** власний легкий self-hosted relay (`relay/`, новий член Bun workspace) —
  не multi-tenant SaaS; WS для desktop (persistent-з'єднання), HTTP push/pull для Android.
* **Модель конфлікту:** append-only merge за server-assigned `seq` (окремо для links/translations)
  * tombstones для видалення (`deleted` прапор у журналі й у локальних сховищах).
* **Auth:** Ory Hydra OAuth2 Authorization Code + PKCE, публічний клієнт (`token_endpoint_auth_method: none`),
  endpoints через OIDC discovery (`<issuer>/.well-known/openid-configuration`), а не жорстко закодовані
  шляхи — уникає неоднозначності подвоєного `/oauth2/oauth2/...` префіксу через nginx-проксі login-ui.
* **Таргет:** Android 16+ — cleartext HTTP не підтримується за замовчуванням, тому TLS для relay
  обов'язковий (не окрема network-security-config гілка).

### Consequences

* Good, because relay не тримає жодних паролів/сесій — уся довіра делегована Ory, менша поверхня атаки
  на стороні relay.
* Good, because JWT-верифікація на relay (`jose.createRemoteJWKSet` проти Hydra JWKS) — стандартний,
  без власного крипто-коду.
* Good, because клієнт `myshare` (public, `token_endpoint_auth_method: none`, `audience: ["myshare"]`,
  `redirect_uri: myshare://oauth/callback`) вже зареєстровано і перевірено проти live dev-оточення
  `https://id.nitra.dev` (namespace `ory-dev`) — встановлена версія `oryd/hydra` не має окремих
  `--pkce`/`--pkce-enforced` прапорців реєстрації клієнта (PKCE передається per-request через
  `code_challenge`/`code_challenge_method`, підтримку S256 підтверджено через
  `code_challenge_methods_supported` у discovery-документі); OIDC discovery підтвердив подвоєний
  `/oauth2/oauth2/{auth,token}` префікс через login-ui gateway — саме тому клієнт резолвить endpoints
  через discovery, а не хардкодить шлях.
* Bad, because дублікати URL при offline-додаванні того самого посилання на двох пристроях до першого
  sync не дедуплікуються за журналом (лише локальний exact-string dedup) — прийнято як задокументоване
  обмеження.
* Bad, because `bun:sqlite` (relay) не резолвиться під vitest/Node — `relay/src/db.js` лениво обирає
  `bun:sqlite` під Bun-рантаймом і `node:sqlite` (майже ідентичний sync API) під тестами.

## More Information

Нові файли:

* `relay/src/{server,db,auth,sync,router}.js`, `relay/package.json`, `relay/vitest.config.js`, `relay/README.md`
* `app/src/opfs.js` — спільний OPFS-хелпер, винесений з `link-store.js`
* `app/src/sync/{device-id,session-store,auth,client}.js` — sync-двигун і Ory PKCE-логін
* `app/src/components/SyncSettings.vue` — діалог налаштувань синхронізації (relay URL, Ory issuer, логін/логаут)
* Тести: `relay/src/{db,sync,auth}.test.js`, `app/src/sync/{device-id,session-store,auth,client}.test.js`

Змінені файли:

* `app/src/link-store.js` — нова схема `links.json` (`{version, linksSeq, items:[{id,url,createdAt,deleted}]}`),
  міграція старого `string[]`-формату без втрати даних, нові `removeLink`/`listLinkRecords`/
  `_applyRemoteLinkMutation`/`_lastSyncedSeq`/`_setLastSyncedSeq`.
* `app/src/translation-cache.js` — записи доповнені `deleted`/`updatedAt`, нові `removeTranslation`/
  `_applyRemoteTranslationMutation`/`_lastSyncedSeq`/`_setLastSyncedSeq`.
* `app/src/App.vue` — кнопка видалення посилання, push мутацій у sync-клієнт, `myshare:sync-updated`
  listener, запуск `startSync()`/`pullOnce()` при старті якщо є сесія.
* `app/src-tauri/Cargo.toml`, `app/src-tauri/src/lib.rs` — `tauri-plugin-deep-link` (OAuth callback).
* `app/src-tauri/tauri.conf.json` — `plugins.deep-link.schemes: ["myshare"]`.
* `app/src-tauri/capabilities/default.json` — `deep-link:default` permission.
* `docs/explanation/architecture.md` — виправлено застарілі посилання на `url-history.js`/localStorage,
  додано relay + Ory до Building Block View/Runtime View.

Ops-крок поза кодом (одноразовий, не автоматизований): реєстрація Hydra OAuth2-клієнта `myshare`
(public, PKCE, `redirect_uri: myshare://oauth/callback`) проти `/Users/vitalii/www/nitra/ory` —
команда й застереження щодо flag-ів у `relay/README.md`.
