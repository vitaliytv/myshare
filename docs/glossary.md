# Glossary

Терміни проєкту `myshare`. Перший вхід у кожен LLM-промпт регенерації проекцій — для уникнення дрейфу термінології.

- **myshare** — Android-застосунок проєкту, що приймає посилання через стандартний Android Share механізм і відображає URL у UI.
- **Share intent** — системний Android-механізм `ACTION_SEND` із MIME-типом `text/plain`, через який інші застосунки передають URL у `myshare`.
- **Native Shell** — Rust + Tauri 2 mobile частина застосунку `myshare`, що приймає share intent від Android OS.
- **Frontend** — Vue 3 + Quasar + Vite частина застосунку `myshare`, що рендерить UI і показує URL.
- **Tauri event** — канал передачі даних із Native Shell у Frontend у застосунку `myshare`.
- **Local Storage** — Web `localStorage` WebView Android, у якому Frontend `myshare` персистить історію URL під ключем `myshare.sharedUrls`.
- **URL History** — JSON-масив рядків у Local Storage застосунку `myshare`, найсвіжіший URL індексом `0`; модуль `app/src/url-history.js`.
