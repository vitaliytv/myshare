import { fetch } from '@tauri-apps/plugin-http'

// Витягує текст <title>. Повертає trimmed string або '' якщо нема.
// @param {Document} doc
// @returns {string}
export function extractTitle(doc) {
  return doc.querySelector('title')?.textContent?.trim() ?? ''
}

// Шукає <link> елементу серед `<head>`, де rel-атрибут містить заданий
// space-separated токен. Не покладається на CSS [rel~="..."] — happy-dom
// (test env) парсить його не так, як справжній браузер, тому робимо явний check.
// @param {Document} doc
// @param {string} token — точний rel-токен (case-insensitive), напр. 'icon'.
// @returns {Element|null}
export function findLinkByRel(doc, token) {
  const target = token.toLowerCase()
  for (const link of doc.querySelectorAll('link[rel][href]')) {
    const tokens = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/)
    if (tokens.includes(target)) return link
  }
  return null
}

// Шукає favicon у <head> у порядку пріоритету. Якщо нічого не знайшли —
// fallback на /favicon.ico відносно origin'у сторінки (правило де-факто з HTML4).
// Повертає **абсолютний** URL (через URL constructor relativу до baseUrl) або ''.
// @param {Document} doc
// @param {string} baseUrl — URL сторінки (після redirects), для resolve відносних посилань.
// @returns {string}
export function extractFaviconUrl(doc, baseUrl) {
  // Пріоритет: explicit icon (включає <link rel="shortcut icon">, бо там є
  // токен `icon`) → apple-touch-icon → precomposed → fallback /favicon.ico.
  // Беремо ПЕРШЕ підходяще, без вибору найбільшого розміру — на UI картка маленька.
  const link =
    findLinkByRel(doc, 'icon') ??
    findLinkByRel(doc, 'apple-touch-icon') ??
    findLinkByRel(doc, 'apple-touch-icon-precomposed')
  const href = link?.getAttribute('href')
  if (href) return resolveUrl(href, baseUrl)
  return resolveUrl('/favicon.ico', baseUrl)
}

// URL constructor: якщо href абсолютний — повертає його; якщо відносний — приєднує до base.
// Будь-яка помилка (некоректний URL) → '' (щоб UI не зламався).
// @param {string} href
// @param {string} base
// @returns {string}
export function resolveUrl(href, base) {
  try {
    return new URL(href, base).toString()
  } catch {
    return ''
  }
}

// Парсить HTML-рядок у Document через DOMParser. DOMParser є і в WebView,
// і в happy-dom (test env), тому модуль однаково testable.
// @param {string} html
// @returns {Document}
export function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html')
}

// Дістає {title, favicon} для URL. Використовує tauri-plugin-http (Rust-проксі,
// без CORS), бо WebView fetch до зовнішніх доменів блокується browser-policy.
// Повертає {title, favicon}; помилки кидаються до caller'а (Vue catch + show).
// @param {string} url
// @returns {Promise<{title: string, favicon: string}>}
export async function fetchPageMeta(url) {
  // 10s timeout — share-флоу інтерактивний, далі чекати безглуздо.
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
    headers: {
      // Деякі сайти повертають мобільну версію або interstitial замість HTML
      // без user-agent. Прикидаємось десктоп-браузером — для metadata цього досить.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml'
    }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  // response.url містить фінальний URL після redirects — використовуємо як base.
  const finalUrl = response.url || url
  const html = await response.text()
  const doc = parseHtml(html)
  return {
    title: extractTitle(doc),
    favicon: extractFaviconUrl(doc, finalUrl)
  }
}
