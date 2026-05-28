# How to run myshare

Інструкція з локального запуску застосунку `myshare` у dev-режимі Tauri 2.

## Передумови

- `bun >= 1.3`
- `node >= 24`
- Робоче Android SDK + підключений Android-пристрій або емулятор для запуску `myshare` на платформі Android.

## Встановити залежності

```sh
bun install
```

## Запустити dev-режим

```sh
bun run start
```

Команда `bun run start` запускає `tauri dev` у воркспейсі `app/` — піднімає Vite dev-сервер для frontend `myshare` і Tauri mobile shell для native-частини застосунку.
