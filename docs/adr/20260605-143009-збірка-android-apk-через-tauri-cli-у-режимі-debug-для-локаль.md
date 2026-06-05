---
session: 60f7eed6-8599-4f19-8219-126c0b08d6d5
captured: 2026-06-05T14:30:09+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/60f7eed6-8599-4f19-8219-126c0b08d6d5.jsonl
---

## ADR Збірка Android APK через Tauri CLI у режимі debug для локального тестування

## Context and Problem Statement
Потрібно зібрати `.apk`-файл Tauri-застосунку `myshare` для встановлення на власний Android-телефон без публікації у Play Store. Проєкт уже мав ініціалізований `gen/android` і налаштоване середовище (Android SDK, NDK 30.0.14904198, JAVA_HOME → Android Studio JBR).

## Considered Options
* `tauri android build --apk --debug` (непідписаний debug-APK, universal ABI)
* release-збірка з keystore (підписаний APK для розповсюдження)
* `bun run android:install` (build + автоматична установка через adb)

## Decision Outcome
Chosen option: "`tauri android build --apk --debug` (universal debug APK)", because користувач явно обрав варіант «для себе» — непідписаний debug-APK не потребує keystore і дозволяє встановлення через «невідомі джерела».

### Consequences
* Good, because не потрібен keystore чи налаштування підпису — збірка запускається без додаткової конфігурації.
* Good, because universal APK (`app-universal-debug.apk`) охоплює всі ABI (arm64, armeabi-v7a тощо) і не прив'язаний до конкретної архітектури.
* Bad, because розмір universal debug APK — 775 MB, що суттєво більше за arch-specific або release-збірку; для передачі на телефон (Telegram, кабель, хмара) це може бути незручно.

## More Information
* Команда збірки: `bun --cwd=app run tauri android build --apk --debug`
* Готовий файл: `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` (775 MB)
* Android-проєкт ініціалізований: `app/src-tauri/gen/android/`
* Tauri-конфіг: `app/src-tauri/tauri.conf.json`
* Середовище: `ANDROID_HOME=/Users/vitalii/Library/Android/sdk`, `NDK_HOME=.../ndk/30.0.14904198`, `JAVA_HOME` → Android Studio JBR
* Альтернативний скрипт для build + install: `bun run android:install` (з кореневого `package.json`)
* Release-збірка з keystore — не розглядалася в transcript, лише згадана як окремий майбутній крок.
