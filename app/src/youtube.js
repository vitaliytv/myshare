import { invoke } from '@tauri-apps/api/core'

// Витягує YouTube video ID із URL. Підтримує:
//   - https://www.youtube.com/watch?v=ID&...
//   - https://youtu.be/ID
//   - https://www.youtube.com/shorts/ID
//   - https://www.youtube.com/embed/ID
//   - https://m.youtube.com/... (мобільний)
//   - https://youtube-nocookie.com/embed/ID
// Чиста функція над URL-рядком. Caller вирішує, чи це YouTube.
// @param {string} url
// @returns {string} videoId або ''
/**
 *
 */
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

/**
 *
 */
function validateVideoId(id) {
  return /^[\w-]{11}$/.test(id) ? id : ''
}

// Запитує транскрипт через Rust-команду `yt_get_transcript`, яка ходить у
// supadata.ai (потребує SUPADATA_API_KEY у `app/src-tauri/.env`). Пробує
// мови у порядку `preferred` (перша наявна перемагає).
//
// Повертає `{ languageCode, text, availableLangs }`. На помилку (немає ключа,
// мова відсутня, мережева) — Rust віддає рядок-помилку, який caller catch'ає.
//
// @param {string} videoId
// @param {Array<string>} preferred
// @returns {Promise<{languageCode: string, text: string, availableLangs: string[]}>}
/**
 *
 */
export async function getYoutubeTranscript(videoId, preferred = ['uk', 'en']) {
  if (!validateVideoId(videoId)) {
    throw new Error('invalid YouTube video id')
  }
  return invoke('yt_get_transcript', { videoId, preferred })
}

// Запитує список мов субтитрів, доступних для відео (Rust-команда
// `yt_list_languages`, один виклик supadata без витягування всього тексту).
// Дозволяє показати по кожному лінку статус наявності субтитрів. Порожній
// масив = у відео взагалі немає субтитрів.
//
// @param {string} videoId
// @returns {Promise<string[]>} напр. ['uk', 'en', 'de']
/**
 *
 */
export async function getYoutubeLanguages(videoId) {
  if (!validateVideoId(videoId)) {
    throw new Error('invalid YouTube video id')
  }
  return invoke('yt_list_languages', { videoId })
}
