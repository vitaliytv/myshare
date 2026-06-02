# Component: Platform Detection

Модуль `platform` дозволяє Frontend `myshare` різнити сценарії запуску застосунку на **Android** (справжній share intent від MainActivity) і на **desktop** (share intent відсутній як OS-механізм, замість нього показується helper-input). Користувач застосунку `myshare` на маку має змогу швидко перевіряти UX без фізичного телефона; на телефоні — той самий код-шлях, але без зайвого dev-input у production-вигляді.

??? engineer "Реалізація модуля `platform` у `myshare`" - Файл: `app/src/platform.js`. - API: `isAndroidUserAgent(ua)` — чиста функція над рядком; `isAndroidPlatform()` — обгортка, що бере `navigator.userAgent`. - Детекція: substring `Android` у UA (case-insensitive). Це працює і для Android Chromium WebView (Tauri 2 mobile), і для звичайних мобільних браузерів. macOS Tauri WKWebView не містить `Android` у UA — повертається `false`. - Використання у `App.vue`: `const showShareHelper = !isAndroidPlatform()`. Helper-секція `<q-input>` рендериться лише за цією умовою. На production-білді для Android її просто немає в DOM. - Альтернативи, які НЕ використовуються: - `@tauri-apps/plugin-os` — overkill для одного бінарного check'а, додає runtime-залежність. - `import.meta.env.DEV` — false negative, бо Android dev-білд теж DEV, а helper там не потрібен.

??? ops "Що моніторити для модуля `platform` у `myshare`" - При оновленнях Tauri/WebView перевірити, що UA на Android досі містить рядок `Android`. Зазвичай це гарантується Chromium System WebView, але теоретично можна вимкнути у `WebView.getSettings().setUserAgentString(...)`. Якщо колись зміниться — додати fallback на `@tauri-apps/api/os.platform()`.

## Тести

- `app/src/platform.test.js` — vitest, фікс-UA рядки: Android WebView, macOS WKWebView, iPhone, нижній регістр, порожні/нечислові значення.
