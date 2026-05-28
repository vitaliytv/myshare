# Component: Page Metadata

Модуль `page-meta` робить так, щоб картка у списку прийнятих URL застосунку `myshare` показувала не сирий URL, а **favicon і title цільової сторінки**. Користувач застосунку `myshare` бачить, *що саме* поділилось у share sheet, ще до того, як відкриє посилання у браузері.

??? engineer "Реалізація модуля `page-meta` у `myshare`"
    - Файл: `app/src/page-meta.js`.
    - Транспорт: `@tauri-apps/plugin-http` — fetch виконується у Rust-проксі застосунку `myshare`, тому WebView CORS не блокує cross-origin запити. Capability `http:default` у `app/src-tauri/capabilities/default.json` дозволяє `http://**` і `https://**`.
    - API: `fetchPageMeta(url)` повертає `{ title, favicon }`; внутрішні helpers — `parseHtml(html)`, `extractTitle(doc)`, `extractFaviconUrl(doc, baseUrl)`, `resolveUrl(href, base)`, `findLinkByRel(doc, token)`.
    - Парсинг HTML: `DOMParser` (доступний у WebView і у happy-dom test env), тому модуль однаково testable.
    - Пріоритет favicon: `<link rel="icon">` → `<link rel="apple-touch-icon">` → `<link rel="apple-touch-icon-precomposed">` → fallback `/favicon.ico` на origin сторінки після redirects (`response.url`).
    - Tokens у атрибуті `rel` обробляються вручну (`split(/\s+/)` + `includes`), а не через CSS-селектор `[rel~="..."]`, бо happy-dom матчить його не зовсім за специфікацією.
    - User-Agent у запиті — desktop Chrome 120, щоб уникати mobile-варіантів і interstitial-сторінок без `<meta>`.

??? ops "Що моніторити для модуля `page-meta` у `myshare`"
    - Помилки `fetchPageMeta` не падають UI: блок історії показує URL без title і fallback-іконку `sym_o_link`. Тимчасові мережеві помилки на старті не критичні.
    - Mixed-content: коли WebView origin `https://` (release) фетчить favicon з `http://`-сайту — браузер може заблокувати `<q-img src>`. Поки що це обробляється `@error` обробником у `App.vue` (показує fallback-іконку). Якщо доведеться часто — додамо проксі через Rust команду.

## Тести

- `app/src/page-meta.test.js` — vitest, мок `@tauri-apps/plugin-http`, кейси: абсолютний/відносний favicon, fallback на `/favicon.ico`, redirect handling, не-2xx статус, мережева помилка, відсутній title.
