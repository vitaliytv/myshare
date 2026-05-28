# How to run myshare

Інструкція з локального запуску застосунку `myshare` у dev-режимі Tauri 2.

## Передумови

- `bun >= 1.3`
- `node >= 24`
- Робоче Android SDK + `adb` у `PATH` для запуску `myshare` на платформі Android.
- Підключений Android-пристрій або емулятор. На фізичному телефоні: ввімкнути **Developer options → USB debugging**, схвалити запит `adb` при першому підключенні; перевірити, що пристрій видно — `adb devices` має показати серійник зі статусом `device`.

## Встановити залежності

```sh
bun install
```

## Запустити dev-режим (desktop)

```sh
bun run start
```

Команда `bun run start` запускає `tauri dev` у воркспейсі `app/` — піднімає Vite dev-сервер для frontend `myshare` і Tauri desktop shell для native-частини застосунку.

## Запустити dev-режим на підключеному Android-телефоні

```sh
bun run android
```

Команда `bun run android` запускає `tauri android dev` у воркспейсі `app/`: збирає debug-білд застосунку `myshare`, ставить його на підключений пристрій через `adb` і вмикає hot-reload з Vite dev-сервера.

Якщо одночасно підключено фізичний телефон і емулятор, Tauri попросить вибрати ціль. Щоб одразу прибити запуск `myshare` до конкретного пристрою — передай серійник з `adb devices`:

```sh
bun run android -- --device <serial>
```
