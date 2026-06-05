---
session: 60f7eed6-8599-4f19-8219-126c0b08d6d5
captured: 2026-06-05T14:26:43+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-myshare/60f7eed6-8599-4f19-8219-126c0b08d6d5.jsonl
---

## ADR Збірка Android APK через Tauri CLI

## Context and Problem Statement
Потрібно зібрати `.apk`-файл для ручного встановлення на Android-пристрій (sideload). Проєкт — Bun-монорепо з фронтендом на Vite та Rust-бекендом (`app/src-tauri/`), тому стандартний `npm`/`gradle`-шлях не підходить напряму.

## Considered Options
* Збірка APK через `tauri android build` (Tauri CLI)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Збірка APK через `tauri android build` (Tauri CLI)", because проєкт вже містить ініціалізований Android-таргет (`app/src-tauri/gen/android/`), а `adb` доступний у системі (`/Users/vitalii/Library/Android/sdk/platform-tools/adb`), що підтверджує готовність Tauri Android pipeline.

### Consequences
* Good, because transcript фіксує очікувану користь: Android-директорія вже ініціалізована (`tauri android init` не потрібен повторно), тому збірка може стартувати одразу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Tauri-конфігурація: `app/src-tauri/tauri.conf.json`
- Rust-маніфест: `app/src-tauri/Cargo.toml`
- Згенерований Android-проєкт: `app/src-tauri/gen/android/` (містить `build.gradle.kts`, `gradlew`, `settings.gradle`, `tauri.settings.gradle`)
- `adb` знайдено: `/Users/vitalii/Library/Android/sdk/platform-tools/adb`
- Менеджер пакетів: `bun` (монорепо з воркспейсами `app` і `scripts`)
- Transcript обривається до видачі фінальної команди збірки; конкретний CLI-виклик (`bunx tauri android build` або аналог) у записі не зафіксований.
