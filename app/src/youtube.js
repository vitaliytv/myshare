import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { Innertube } from 'youtubei.js'

// Витягує YouTube video ID із URL. Підтримує:
//   - https://www.youtube.com/watch?v=ID&...
//   - https://youtu.be/ID
//   - https://www.youtube.com/shorts/ID
//   - https://www.youtube.com/embed/ID
//   - https://m.youtube.com/... (мобільний)
//   - https://youtube-nocookie.com/embed/ID
// Повертає '' для не-YouTube або некоректного URL — caller вирішує, чи це YouTube.
// @param {string} url
// @returns {string} videoId або ''
export function extractYoutubeVideoId(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return ''
  }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') {
    return validateVideoId(u.pathname.slice(1).split('/')[0])
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      return validateVideoId(u.searchParams.get('v') ?? '')
    }
    const prefixMatch = u.pathname.match(/^\/(shorts|embed|v|live)\/([^/?#]+)/)
    if (prefixMatch) {
      return validateVideoId(prefixMatch[2])
    }
  }
  return ''
}

// YouTube ID — це 11 символів base64url. Гарантуємо формат, щоб не передавати
// сміття далі у Innertube API.
// @param {string} id
// @returns {string}
function validateVideoId(id) {
  return /^[\w-]{11}$/.test(id) ? id : ''
}

// Синглтон Innertube-клієнта. `Innertube.create()` робить кілька HTTP-запитів
// (config, player base.js) — кешуємо інстанс для повторного використання у
// межах сесії app. Якщо створення впало, повертаємо `null` — caller трактує
// це як «YouTube недоступний», нічого не throws у UI.
// @type {Promise<import('youtubei.js').Innertube>|null}
let innertubePromise = null

// `youtubei.js` за замовчуванням викликає глобальний `fetch`. У Tauri WebView
// (browser) глобальний fetch обмежений CORS і YouTube блокує його. Підставляємо
// `tauri-plugin-http` fetch, який ходить через Rust-проксі — без CORS, з cookies.
//
// @param {Request|string} input
// @param {RequestInit} [init]
// @returns {Promise<Response>}
function bridgedFetch(input, init) {
  // Innertube часом передає Request-об'єкт (`new Request(url, ...)`). tauriFetch
  // приймає або URL-рядок, або Request, тож просто прокидаємо як є.
  return tauriFetch(input, init)
}

// @returns {Promise<import('youtubei.js').Innertube|null>}
function getInnertube() {
  if (innertubePromise) return innertubePromise
  innertubePromise = Innertube.create({
    generate_session_locally: true,
    fetch: bridgedFetch
  }).catch(error => {
    // Не зберігаємо failed-promise — при наступному виклику дамо ще одну спробу
    // (мережа могла відновитись).
    innertubePromise = null
    throw error
  })
  return innertubePromise
}

// Пріоритет: спершу мова з `preferred` (manual track перемагає auto),
// далі наступна мова. languageCode матчиться як префікс (en-US → en).
// @param {Array<{language_code: string, kind?: string}>} tracks
// @param {Array<string>} preferred — порядок переваги, lowercase.
// @returns {object|null}
export function pickPreferredCaption(tracks, preferred) {
  for (const lang of preferred) {
    const inLang = tracks.filter(t => (t.language_code ?? '').toLowerCase().split('-')[0] === lang)
    if (inLang.length === 0) continue
    return inLang.find(t => t.kind !== 'asr') ?? inLang[0]
  }
  return null
}

// Зручний summary-обʼєкт із track для UI (не залежимо від youtubei.js типів
// у тестах/інтерфейсі). Зберігаємо `baseUrl`, щоб у фазі fetchCaptionText
// підставити його у `yt.session.http.fetch`.
// @param {object} track — youtubei caption track або null.
// @returns {{languageCode, name, isAuto, baseUrl}|null}
function summarizeTrack(track) {
  if (!track) return null
  return {
    languageCode: track.language_code,
    name: track.name?.text ?? track.language_code,
    isAuto: track.kind === 'asr',
    baseUrl: track.base_url
  }
}

// **Фаза 1**: швидкий пошук підходящого caption track для відео. Робить лише
// Innertube.getInfo, без завантаження XML/JSON транскрипту. Результат цієї
// фази потрібний UI, щоб показати кнопку «Дивитись субтитри» (з мовою).
//
// @param {string} videoId
// @param {Array<string>} preferred
// @returns {Promise<{languageCode, name, isAuto, baseUrl}|null>}
export async function findYoutubeCaption(videoId, preferred = ['uk', 'en']) {
  if (!validateVideoId(videoId)) return null
  const yt = await getInnertube()
  const info = await yt.getInfo(videoId)
  const tracks = info.captions?.caption_tracks ?? []
  return summarizeTrack(pickPreferredCaption(tracks, preferred))
}

// **Фаза 2**: завантаження plain-text транскрипту за summary-track із
// `findYoutubeCaption`. Робиться при відкритті діалогу субтитрів, не
// заздалегідь — деякі відео мають довгі транскрипти (1–4 МБ JSON).
//
// YouTube віддає baseUrl лише під сесійні cookies — нативний fetch без них
// повертає 0 байт. Тому йдемо через `yt.session.http.fetch`, який кладе
// у запит правильні visitor headers + cookies.
//
// @param {{baseUrl: string}} track — summary-track із findYoutubeCaption.
// @returns {Promise<string>}
export async function fetchCaptionText(track) {
  if (!track?.baseUrl) return ''
  const yt = await getInnertube()
  const url = new URL(track.baseUrl)
  url.searchParams.set('fmt', 'json3')
  const response = await yt.session.http.fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.text()
  const json = tryParseJson(body)
  return json ? parseCaptionJson3(json) : parseCaptionXml(body)
}

function tryParseJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// Парсить YouTube json3-формат у plain text. Структура:
//   { events: [{ tStartMs, dDurationMs, segs: [{ utf8: "слова" }, ...] }, ...] }
// segs склеюються; hard-break \n замінюємо на пробіл; події без segs (append-only,
// padding) пропускаємо.
// @param {object} json
// @returns {string}
export function parseCaptionJson3(json) {
  if (!Array.isArray(json?.events)) return ''
  const lines = []
  for (const event of json.events) {
    if (!Array.isArray(event.segs)) continue
    const text = event.segs
      .map(s => (typeof s?.utf8 === 'string' ? s.utf8 : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) lines.push(text)
  }
  return lines.join('\n')
}

// Fallback на XML timedtext (legacy `<transcript><text>` або v3 `<timedtext><p>`).
// Залишений на випадок, коли json3 примусово не злазить.
// @param {string} xml
// @returns {string}
export function parseCaptionXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const legacy = collectLines(doc.querySelectorAll('text'))
  if (legacy.length > 0) return legacy.join('\n')
  return collectLines(doc.querySelectorAll('p')).join('\n')
}

function collectLines(nodes) {
  return [...nodes].map(node => (node.textContent ?? '').trim()).filter(line => line.length > 0)
}

// Експортуємо для unit-тестів (vi.mock не достатньо, треба forcing reset кешу).
// Не використовувати з App-коду.
export function _resetInnertubeCacheForTest() {
  innertubePromise = null
}
