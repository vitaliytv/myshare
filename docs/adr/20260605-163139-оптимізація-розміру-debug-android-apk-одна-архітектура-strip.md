---
session: 60f7eed6-8599-4f19-8219-126c0b08d6d5
captured: 2026-06-05T16:31:39+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/60f7eed6-8599-4f19-8219-126c0b08d6d5.jsonl
---

## ADR Оптимізація розміру debug Android APK: одна архітектура + strip символів

## Context and Problem Statement
`bun --cwd=app run tauri android build --apk --debug` без додаткових прапорців збирав **universal APK** (4 архітектури: arm64-v8a, armeabi-v7a, x86, x86_64) з повними debug-символами Rust. Результат — файл розміром 775 MB, де ~75% займають бібліотеки під архітектури, яких немає в цільового пристрою, і решта — налагоджувальна інформація у `.so`.

## Considered Options
* Universal APK з усіма архітектурами та debug-символами (стан до змін)
* `--target aarch64` + `strip = true` у `[profile.dev]` (тільки arm64, без символів)

## Decision Outcome
Chosen option: "`--target aarch64` + `strip = true`", because усі сучасні телефони — arm64, а debug-символи не потрібні для запуску застосунку; поєднання двох змін скоротило APK з 775 MB до 33 MB (×23).

### Consequences
* Good, because `lib/arm64-v8a/libmyshare_lib.so` зменшилась з 168 MB до 27 MB, фінальний APK — 33 MB замість 775 MB.
* Bad, because transcript не містить підтверджених негативних наслідків; якщо знадобиться тестувати на емуляторах x86/x86_64 — потрібен окремий build без `--target aarch64`.

## More Information
- `app/src-tauri/Cargo.toml` — додано секцію `[profile.dev]` з `strip = true`.
- Команда збірки: `bun --cwd=app run tauri android build --apk --debug --target aarch64`.
- Артефакт: `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.

---

## ADR Структура npm-скриптів для Android: android:apk + android:install з target aarch64

## Context and Problem Statement
Початковий скрипт `android:install` у `package.json` будував universal APK, але шлях `adb install` вказував на `apk/arm64/debug/app-arm64-debug.apk` — файл, якого Tauri не створює (він кладе результат у `apk/universal/debug/`). Скрипт не міг спрацювати після збірки.

## Considered Options
* Виправити лише шлях у `android:install` на `universal`-варіант
* Розділити на `android:apk` (build) і `android:install` (build + adb), обидва з `--target aarch64`

## Decision Outcome
Chosen option: "розділити на `android:apk` і `android:install`", because прапорець `--target aarch64` потрібен в обох місцях, а виділення `android:apk` як базового скрипту дозволяє оновлювати параметри збірки в одному місці, а `android:install` просто викликає `bun run android:apk && adb install -r ...`.

### Consequences
* Good, because transcript фіксує очікувану користь: зміна прапорців збірки в одному місці (`android:apk`) автоматично підхоплюється і `android:install`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Змінено: `package.json`, `scripts.android:install` і додано `scripts.android:apk`.
- `android:apk`: `bun --cwd=app run tauri android build --apk --debug --target aarch64 && cp <src>/app-universal-debug.apk ./myshare.apk`.
- `android:install`: `bun run android:apk && adb install -r ./myshare.apk`.

---

## ADR Копіювання фінального APK-артефакту в корінь проєкту та виключення з git

## Context and Problem Statement
Зібраний APK лежить глибоко у `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` — шлях незручний для ручної передачі файлу та нефіксована назва. Користувачу потрібен один стабільний файл у корені проєкту.

## Considered Options
* Залишити APK за Gradle-шляхом і вказувати повний шлях щоразу
* Копіювати як `myshare.apk` у корінь проєкту як частину `android:apk`-скрипту

## Decision Outcome
Chosen option: "копіювати `myshare.apk` у корінь", because це дає стабільне, коротке ім'я файлу, зручне для передачі через Telegram/кабель, і не потребує окремого інструменту.

### Consequences
* Good, because `myshare.apk` завжди в корені після `bun run android:apk` — один стабільний артефакт.
* Bad, because `myshare.apk` додано до `.gitignore` (33 MB бінарний артефакт не комітиться), тож файл не відтворюється з git без перезбірки — але це очікувана поведінка для build-артефактів.

## More Information
- `myshare.apk` додано до `.gitignore` командою `printf '\n# Android APK артефакт\nmyshare.apk\n' >> .gitignore`.
- Копіювання (`cp ... ./myshare.apk`) вшито в скрипт `android:apk` у `package.json`.
