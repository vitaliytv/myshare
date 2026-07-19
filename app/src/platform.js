const androidUserAgentPattern = /Android/i

// Визначає, чи WebView (або браузер) працює на Android.
// Чиста функція — приймає UA-рядок, повертає bool. Тестується без mocking
// global navigator. Користувач у Vue читає `isAndroidPlatform()` без параметра —
// функція сама бере navigator.userAgent.
//
// На Android Tauri WebView UA містить "Android" (його ставить Chromium system
// WebView). На macOS dev-вікні Tauri використовує WKWebView — там "Macintosh"
// + "Mac OS X". Тож достатньо substring-check.
//
/**
 * Перевіряє, чи належить User-Agent Android.
 * @param {string} ua User-Agent-рядок для перевірки.
 * @returns {boolean} `true`, якщо User-Agent позначає Android.
 */
export function isAndroidUserAgent(ua) {
  return typeof ua === 'string' && androidUserAgentPattern.test(ua)
}

/**
 * Визначає, чи застосунок запущений на Android.
 * @returns {boolean} `true`, якщо застосунок запущено на Android.
 */
export function isAndroidPlatform() {
  return isAndroidUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
}
