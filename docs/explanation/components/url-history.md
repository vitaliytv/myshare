# Component: URL History

Модуль `url-history` зберігає послідовність посилань, які `myshare` прийняв через Android Share, у локальному сховищі пристрою. Користувач застосунку `myshare` бачить накопичену історію URL між запусками — навіть після перезапуску додатка ніщо не губиться.

??? engineer "Реалізація модуля `url-history` у `myshare`"
    - Файл: `app/src/url-history.js`.
    - Сховище: Web `localStorage`, ключ `myshare.sharedUrls`.
    - Формат: JSON-масив рядків `string[]`, найновіший URL — індекс `0`.
    - API: `loadUrlHistory(storage)`, `saveUrlHistory(storage, history)`, `appendUrlToHistory(history, url)`. Усі функції чисті, `storage` інжектується (тестується через mock без `happy-dom` API).
    - Інваріанти валідації: `loadUrlHistory` фільтрує не-рядки та порожні рядки, повертає `[]` для malformed JSON, `null`/відсутнього сховища і не-масиву; `appendUrlToHistory` не змінює історію для порожнього або не-рядка.
    - Підключення: `app/src/App.vue` викликає `loadUrlHistory` на `onMounted` і `appendUrlToHistory` + `saveUrlHistory` у `handleAndroidShare` для подій `window.addEventListener('myshare:android-share', ...)`.

??? ops "Що моніторити для модуля `url-history` у `myshare`"
    - Квота `localStorage` у WebView Android може бути ~5 МБ. Поки історія не обмежена за розміром — слідкувати за повідомленнями `QuotaExceededError` у логах WebView застосунку `myshare`. При появі — додати cap через окремий ADR.
    - Втрата `localStorage` (очистка даних застосунку `myshare` користувачем у налаштуваннях Android) призводить до порожньої історії на старті — це очікувана поведінка, не помилка.

## Тести

- `app/src/url-history.test.js` — vitest, покриття всіх гілок валідації load/append/save.
