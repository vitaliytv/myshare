// Визначає, чи WebView (або браузер) працює на Android.
// Чиста функція — приймає UA-рядок, повертає bool. Тестується без mocking
// global navigator. Користувач у Vue читає `isAndroidPlatform()` без параметра —
// функція сама бере navigator.userAgent.
//
// На Android Tauri WebView UA містить "Android" (його ставить Chromium system
// WebView). На macOS dev-вікні Tauri використовує WKWebView — там "Macintosh"
// + "Mac OS X". Тож достатньо substring-check.
//
// @param {string} ua
// @returns {boolean}
/**
 *
 */
export function isAndroidUserAgent(ua) {
  return typeof ua === 'string' && /Android/i.test(ua)
}

// @returns {boolean} true якщо запущено на Android.
/**
 *
 */
export function isAndroidPlatform() {
  return isAndroidUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
}
