---
session: 60f7eed6-8599-4f19-8219-126c0b08d6d5
captured: 2026-06-05T14:31:36+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/60f7eed6-8599-4f19-8219-126c0b08d6d5.jsonl
---

## ADR Збірка Android APK для Tauri-застосунку через universal-варіант

## Context and Problem Statement
Розробнику потрібно було зібрати Android APK з Tauri-застосунку (`myshare`) для встановлення на власний телефон. Проєкт вже мав ініціалізований Android-підпроєкт (`app/src-tauri/gen/android`), але скрипт `android:install` у `package.json` посилався на шлях `apk/arm64/debug/app-arm64-debug.apk`, тоді як Tauri фактично генерує `universal`-варіант APK.

## Considered Options
* Зібрати `arm64`-специфічний APK (`--target aarch64-linux-android`)
* Зібрати universal APK (всі ABI в одному файлі) — фактична поведінка `tauri android build --apk --debug` без явного `--target`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "universal APK", because команда `bun --cwd=app run tauri android build --apk --debug` без явного `--target` згенерувала `app-universal-debug.apk` за шляхом `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/`, і цей варіант підходить для будь-якого телефону без необхідності обирати ABI. Скрипт `android:install` у `package.json` було виправлено під цей шлях.

### Consequences
* Good, because transcript фіксує очікувану користь: universal APK встановлюється на будь-який телефон (arm64, arm, x86) без додаткового вибору таргету.
* Bad, because debug universal APK важить ~775 MB — значно більше, ніж release-збірка або arch-специфічний варіант; це нормально для особистого використання, але неприйнятно для роздачі.

## More Information
- Команда збірки: `bun --cwd=app run tauri android build --apk --debug`
- Вихідний файл: `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- Виправлений скрипт: `android:install` у `/Users/vitalii/www/vitaliytv/myshare/package.json` — шлях змінено з `apk/arm64/debug/app-arm64-debug.apk` на `apk/universal/debug/app-universal-debug.apk`
- Команда встановлення: `adb install -r <шлях до apk>`
- Середовище: `ANDROID_HOME=/Users/vitalii/Library/Android/sdk`, `NDK_HOME=.../ndk/30.0.14904198`, `JAVA_HOME` з Android Studio
- `tauri.conf.json` і `Cargo.toml` знаходяться в `app/src-tauri/`
