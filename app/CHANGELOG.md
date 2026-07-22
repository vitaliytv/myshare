# Changelog

## [0.4.1] - 2026-07-22

### Changed

- chore(deps): bump @7n/rules ^1.28.1 -> ^1.30.0
- chore(deps): bump @7n/tauri-components ^0.8.0 → ^0.11.1; міграція useAgent→useAcpAgent, вендор resolveOmlx у omlx.js

### Fixed

- Реєстрація Quasar Dialog/Notify у main.js — useUpdater() ($q.dialog) і toast-повідомлення про помилки з AgentDialog/AuditDialog ($q.notify) мовчки падали, бо жоден з плагінів не був зареєстрований

## [0.4.0] - 2026-07-13

### Added

- Desktop↔Android sync посилань і кешу перекладів через self-hosted relay, авторизація через Ory Hydra OAuth2/PKCE (`app/src/sync/`, `app/src/components/SyncSettings.vue`, `tauri-plugin-deep-link`). `link-store.js`/`translation-cache.js` отримали id/timestamp/tombstone для append-only merge; додано видалення посилань.

## [0.3.1] - 2026-07-12

### Changed

- cursor

## [0.3.0] - 2026-07-06

### Changed

- Єдина нумерація версій: версія керується change-файлами (n-cursor release у CI), стрибок 0.3.0 поверх старого ряду v-тегів (v0.2.2, v0.2.3)

## [0.2.1] - 2026-07-05

### Changed

- Локальний use-updater.js замінено на спільний useUpdater() з @7n/tauri-components/vue (0.8.0) — та сама логіка, тепер в одній копії для mlmail/myshare/myllm/task.

### Fixed

- Android-білд падав ("Permission updater:default not found") — updater-плагін не реєструється на Android/iOS, тож дозвіл винесено в окрему capability з `platforms: [macOS, windows, linux]`.

## [0.2.0] - 2026-07-05

### Added

- По кожному YouTube-лінку показуємо статус наявності субтитрів (🇺🇦 UA / 🇬🇧 EN / Без UA·EN) через нову команду yt_list_languages; список мов кешується в localStorage
- Переклад субтитрів EN→UA через локальний Ollama (desktop): кнопка «Перекласти» коли є тільки англійські, переклад по чанках із прогресом, кеш у localStorage (не перекладаємо двічі) та діалог порівняння оригінал↔переклад посегментно
- Показуємо версію застосунку в заголовку тулбару та в title вікна (getVersion + package_info().version); увімкнули createUpdaterArtifacts у tauri.conf.json, щоб build генерував latest.json/.sig для апдейтера
- Перезапуск у нову версію одразу після встановлення оновлення (relaunch), періодична перевірка оновлень щогодини, логування помилок апдейтера; dev-only MCP-міст

### Changed

- move vitest deps to root per vue.mdc
- Ollama-переклад: дефолт-модель gemma3:4b (легка, без свопу на 16 GB) замість gemma4:e4b; keep_alive повернуто на 5хв (модель не перевантажується між чанками) замість негайного вивантаження

### Fixed

- Ollama-переклад: обмеження num_ctx до 8192 і негайне вивантаження моделі (keep_alive 0) після завершення — щоб ~9 GB ваг не висіли в RAM і не гальмували систему на 16 GB
- Надійно оброблено Android Share cold start через pending payload у localStorage.
- Апдейтер не запускається в dev-режимі: версія dev-збірки завжди 0.1.0, тож перевірка помилково пропонувала «оновитись» до опублікованого релізу
- Автооновлення не працювало: у capabilities/default.json бракувало дозволу `updater:default`, тож перевірка оновлень падала з permission-denied ще до мережевого запиту. Додано дозвіл (той самий баг знайдено й виправлено в mlmail).
