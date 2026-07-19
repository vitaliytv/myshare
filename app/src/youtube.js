import { invoke } from '@tauri-apps/api/core'

const YOUTUBE_HOST_PREFIX_PATTERN = /^www\.|^m\./
const YOUTUBE_PATH_PATTERN = /^\/(shorts|embed|v|live)\/([^/?#]+)/
const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/

/**
 * Витягує YouTube video ID із URL. Підтримує стандартні, короткі, вбудовані,
 * мобільні та privacy-enhanced посилання.
 * @param {string} url URL-рядок для обробки.
 * @returns {string} Video ID або порожній рядок.
 */
export function extractYoutubeVideoId(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return ''
  }
  const host = u.hostname.toLowerCase().replace(YOUTUBE_HOST_PREFIX_PATTERN, '')
  if (host === 'youtu.be') {
    return validateVideoId(u.pathname.slice(1).split('/', 1)[0])
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      return validateVideoId(u.searchParams.get('v') ?? '')
    }
    const prefixMatch = u.pathname.match(YOUTUBE_PATH_PATTERN)
    if (prefixMatch) {
      return validateVideoId(prefixMatch[2])
    }
  }
  return ''
}

/**
 * Перевіряє формат YouTube video ID.
 * @param {string} id Ідентифікатор для перевірки.
 * @returns {string} Валідний ID або порожній рядок.
 */
function validateVideoId(id) {
  return YOUTUBE_VIDEO_ID_PATTERN.test(id) ? id : ''
}

/**
 * Запитує транскрипт через Rust-команду `yt_get_transcript` у supadata.ai.
 * Повертає мову, текст і доступні мови; помилки Rust caller обробляє окремо.
 * @param {string} videoId YouTube video ID.
 * @param {string[]} preferred Мови в порядку пріоритету.
 * @returns {Promise<{languageCode: string, text: string, availableLangs: string[]}>} Транскрипт і доступні мови.
 */
export async function getYoutubeTranscript(videoId, preferred = ['uk', 'en']) {
  if (!validateVideoId(videoId)) {
    throw new Error('invalid YouTube video id')
  }
  const transcript = await invoke('yt_get_transcript', { videoId, preferred })
  return transcript
}

/**
 * Запитує список мов субтитрів, доступних для відео, через `yt_list_languages`.
 * @param {string} videoId YouTube video ID.
 * @returns {Promise<string[]>} Коди доступних мов субтитрів.
 */
export async function getYoutubeLanguages(videoId) {
  if (!validateVideoId(videoId)) {
    throw new Error('invalid YouTube video id')
  }
  const languages = await invoke('yt_list_languages', { videoId })
  return languages
}
