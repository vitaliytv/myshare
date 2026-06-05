---
session: 60f7eed6-8599-4f19-8219-126c0b08d6d5
captured: 2026-06-05T16:30:07+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/60f7eed6-8599-4f19-8219-126c0b08d6d5.jsonl
---

## ADR Виправлення шляху `android:install` на universal APK

## Context and Problem Statement
Скрипт `android:install` у `package.json` вказував на шлях `apk/arm64/debug/app-arm64-debug.apk`, але `tauri android build --apk --debug` генерує universal APK за шляхом `apk/universal/debug/app-universal-debug.apk`. Скрипт не знаходив файл і не міг встановити застосунок на телефон.

## Considered Options
* Залишити `arm64`-шлях і збирати із явним прапорцем `--target aarch64`
* Перемкнути скрипт на `universal`-шлях (фактичний вихід Tauri без `--target`)

## Decision Outcome
Chosen option: "Перемкнути скрипт на `universal`-шлях", because Tauri без явного `--target` завжди кладе файл у `universal/debug/`, і цей шлях відповідає реальному виводу збірки.

### Consequences
* Good, because `bun run android:install` тепер знаходить APK і передає його на телефон через `adb install -r`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `package.json`, поле `scripts.android:install`. Команда установки: `adb install -r app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.

---

## ADR Зменшення розміру debug Android APK через strip символів та одну архітектуру

## Context and Problem Statement
Debug APK, зібраний командою `tauri android build --apk --debug` без додаткових прапорців, важив 775 MB. Основна причина: universal-збірка містить чотири копії `libmyshare_lib.so` (arm64-v8a, armeabi-v7a, x86, x86_64) по ~150–170 MB кожна, а кожна копія включає повні Rust debug-символи, які не потрібні для запуску.

## Considered Options
* Зібрати лише під `aarch64` із `strip = true` у `[profile.dev]`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Зібрати лише під `aarch64` із `strip = true` у `[profile.dev]`", because прапорець `--target aarch64` прибирає три непотрібні архітектури, а `strip = true` видаляє debug-символи з `.so` (168 MB → 27 MB), разом давши APK розміром 33 MB замість 775 MB.

### Consequences
* Good, because transcript фіксує очікувану користь: APK зменшився у 23 рази (775 MB → 33 MB), залишивши єдину бібліотеку `lib/arm64-v8a/libmyshare_lib.so`.
* Bad, because без `--target aarch64` (тобто якщо запустити `tauri android build` без прапорця) `strip = true` у `[profile.dev]` застосується до всіх архітектур, але universal APK усе одно залишиться великим через чотири копії.

## More Information
Файл: `app/src-tauri/Cargo.toml`, секція `[profile.dev]`, додано `strip = true`. Команда збірки: `bun --cwd=app run tauri android build --apk --debug --target aarch64`. Для зручності доданий npm-скрипт `android:apk` у `package.json` із тим самим набором прапорців.
