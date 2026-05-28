# myshare

Tauri + Vue 3 + Quasar (bun monorepo).

## Мета Android-проєкту

`myshare` — Android-застосунок для приймання посилань через стандартний Android Share механізм.

Основний сценарій:

1. Користувач у будь-якому Android-застосунку натискає **Share** для посилання.
2. Вибирає `myshare` у системному share sheet.
3. `myshare` отримує переданий URL.
4. Застосунок відкривається та показує отримане посилання на екрані.

Мінімальний результат першої версії — коректно прийняти `text/plain` share intent з URL і відобразити цей URL у UI.

## Запуск

```sh
bun install
bun run start   # tauri dev
```

## Структура

- `app/` — frontend (Vue 3 + Quasar + Vite) і `src-tauri/` (Rust + Tauri 2).
- `scripts/` — допоміжні node-скрипти (docs-regen).
