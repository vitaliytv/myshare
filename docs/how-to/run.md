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

На desktop-режимі під заголовком картки `myshare` з'являється **Share Helper** — `<q-input>` для ручного введення URL. Він замінює відсутній Android Share sheet і викликає той самий код-шлях, що й справжній intent. Helper рендериться тільки коли модуль [`platform`](../explanation/components/platform.md) не виявив Android UA, тому в Android-білдах застосунку `myshare` його немає.

## Запустити dev-режим на підключеному Android-телефоні

```sh
bun run android
```

Команда `bun run android` запускає `tauri android dev` у воркспейсі `app/`: збирає debug-білд застосунку `myshare`, ставить його на підключений пристрій через `adb` і вмикає hot-reload з Vite dev-сервера.

Якщо одночасно підключено фізичний телефон і емулятор, Tauri попросить вибрати ціль. Щоб одразу прибити запуск `myshare` до конкретного пристрою — передай серійник з `adb devices`:

```sh
bun run android -- --device <serial>
```

## Встановити свіжий APK на телефон для офлайн-використання

```sh
bun run android:install
```

Команда `bun run android:install` збирає debug-APK застосунку `myshare` (`tauri android build --apk --debug`) і ставить його на підключений пристрій через `adb install -r`. Після інсталяції `myshare` працює офлайн — без Vite dev-сервера й кабелю; на телефоні з'являється звичайна іконка застосунку.

Debug-APK підписаний debug-ключем Android SDK, тому окремого signing config для `myshare` не потрібно. Артефакт: `app/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`.

Якщо `adb install` повертає `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — стара версія `myshare` була підписана іншим ключем; зніми її через `adb uninstall com.vitaliytv.myshare` і повтори команду.
