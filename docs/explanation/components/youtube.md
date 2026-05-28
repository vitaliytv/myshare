# Component: YouTube Captions

Модуль `youtube` робить так, щоб для посилань на YouTube застосунок `myshare` показував кнопку перегляду субтитрів — спершу українських, у разі відсутності — англійських. Користувач застосунку `myshare` отримує текст відео як читабельний транскрипт, не виходячи з картки історії URL.

## Сценарій користувача

1. Користувач ділиться YouTube-посиланням у Android Share sheet.
2. `myshare` приймає URL у `handleAndroidShare` (через `myshare:android-share` подію з MainActivity або через dev helper-input на desktop).
3. Frontend `myshare` визначає YouTube video ID і робить **фазу 1**: `findYoutubeCaption` через `youtubei.js` отримує список caption tracks і вибирає **manual uk → auto uk → manual en → auto en** за пріоритетом.
4. На картці URL з'являється кнопка `sym_o_subtitles` з кодом мови; для AI-субтитрів додається мітка `(auto)`.
5. Тап кнопки запускає **фазу 2**: `fetchCaptionText` завантажує plain-text транскрипт і відкриває діалог.

## Чому `youtubei.js`, а не raw fetch

З 2025 року YouTube ввів **PO-Token** (Proof-of-Origin Token) для більшості subtitle-endpoints. Сирий GET до `/api/timedtext?...` повертає `200 OK` із **0 байт** body — навіть зі signed URL із watch-сторінки. Без коректних visitor cookies, headers і session ID YouTube тиху відмовляє anonymous-клієнтам.

`youtubei.js` (Innertube-клієнт) робить повну ініціалізацію Innertube session: завантажує `config`, `player_es6.vflset/base.js`, отримує visitor data — і додає це до кожного fetch'а через свій `yt.session.http.fetch`. Тільки в такій сесії baseUrl caption track повертає реальний body (~4–8 KB JSON для типового відео).

Альтернативи, які НЕ використовуються:

- Raw HTTP до `/api/timedtext?v=ID&lang=en` — 0 байт, як описано вище.
- `https://www.youtube.com/youtubei/v1/get_transcript` напряму — `400 FAILED_PRECONDITION` без PO-Token, у будь-якому клієнті (WEB, IOS, ANDROID, TV).
- 3rd-party transcript-сервіси (kome.ai, supadata.ai) — додають зовнішню залежність із власною квотою/біллінгом.

??? engineer "Реалізація модуля `youtube` у `myshare`"
    - Файл: `app/src/youtube.js`.
    - Транспорт: `youtubei.js` (npm `youtubei.js@^17`) — Innertube-клієнт із browser-сумісним bundling через Vite.
    - Прив'язка fetch: `Innertube.create({ fetch: bridgedFetch })` підставляє `tauri-plugin-http` fetch — Innertube ходить через Rust-проксі застосунку `myshare`, обходячи WebView CORS. Capability `http:default` у `app/src-tauri/capabilities/default.json` дозволяє `https://**`.
    - Кешування: модуль тримає `innertubePromise` як singleton — `Innertube.create()` робить 3 початкових HTTP-запити (config, iframe_api, player base.js), які варто робити лише раз за сесію застосунку `myshare`.
    - Помилку при `Innertube.create()` НЕ кешуємо: при наступному виклику дамо ще одну спробу (мережа могла відновитись).
    - API:
        - `extractYoutubeVideoId(url)` — чистий парсер: `youtube.com/watch`, `youtu.be/`, `shorts|embed|v|live/`, `m.youtube.com`, `youtube-nocookie.com`. Валідує ID як 11 символів `[A-Za-z0-9_-]`.
        - `findYoutubeCaption(videoId, ['uk', 'en'])` — **фаза 1**: `Innertube.getInfo` + `pickPreferredCaption`. Повертає summary `{languageCode, name, isAuto, baseUrl}` або `null`. Швидко (1 запит до Innertube).
        - `fetchCaptionText(track)` — **фаза 2**: завантажує `track.baseUrl` із `&fmt=json3` через `yt.session.http.fetch` (із cookies). Парсить через `parseCaptionJson3`; на не-JSON відповідь падає на `parseCaptionXml`.
    - Пріоритет вибору track'а: `uk` → `en` за порядком preferred. У межах однієї мови — manual (без `kind: 'asr'`) перемагає auto-generated. `en-US` матчиться як `en` через strip subtag.
    - Парсери `parseCaptionJson3` і `parseCaptionXml` — pure functions, тестуються без mocking. JSON3 формат YouTube: `{events: [{segs: [{utf8}]}]}` склеюємо через map+join, hard-break `\n` у utf8 → пробіл, події без segs пропускаємо.

??? ops "Що моніторити для модуля `youtube` у `myshare`"
    - YouTube періодично змінює структуру Innertube responses. `youtubei.js` команда тримає `npm update` ритм і випускає виправлення; знак того, що в нас застаріла версія — масові помилки `getInfo` із `null is not an object`. План: `bun add --cwd=app youtubei.js@latest` як один із кроків загального `n-taze`.
    - Регіональний consent interstitial: для EU-IP без visitor cookies Innertube інколи отримує сторінку згоди. Поки `generate_session_locally: true` дає достатньо session metadata, щоб минути цей блок; якщо побачимо `getInfo` failure на конкретних відео — додамо явний consent-bypass.
    - Дуже довгі субтитри (4-годинні стріми) можуть призвести до lag у `<pre>` рендеру. Поки не обмежуємо; при появі скарг — додати pagination або lazy-render.
    - Bundle size: `youtubei.js` додав ~280 KB до `dist/assets/index.js` (gzip ~67 KB). Це прийнятна вартість за обхід PO-Token, але якщо колись з'явиться потреба у lazy-load — обернемо у `() => import('./youtube.js')` як dynamic import.

## Тести

- `app/src/youtube.test.js` — vitest, мок `youtubei.js` через `vi.mock('youtubei.js', ...)`. Покриває: усі варіанти YouTube URL, валідацію videoId, пріоритети `pickPreferredCaption` (uk→en + manual>auto + en-US-as-en), `parseCaptionJson3` (звичайний, padding-events, hard-break, edge cases), `parseCaptionXml` (legacy + v3 + порядок), `findYoutubeCaption` (happy/empty/невалідний ID/синглтон), `fetchCaptionText` (json3, XML fallback, без baseUrl, HTTP-помилка).
