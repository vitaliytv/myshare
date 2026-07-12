// Статус наявності субтитрів для YouTube-відео та кеш списків мов у
// localStorage. Кеш потрібен, бо кожен запит до supadata коштує квоту (free
// tier — 100/місяць): дізнавшись мови для videoId один раз, не питаємо повторно.

export const STORAGE_KEY = 'myshare.captionLangs'

// Зводить список доступних мов до статусу за пріоритетом uk → en.
// Нормалізує регіональні варіанти (`uk-UA`, `en-US`) до базової мови.
//
// @param {string[]} langs доступні мови субтитрів (напр. ['uk','en','de'])
// @returns {{ kind: 'uk'|'en'|'none', hasUk: boolean, hasEn: boolean, langs: string[] }}
/**
 *
 */
export function captionStatus(langs) {
  const list = Array.isArray(langs) ? langs.map(l => String(l).toLowerCase()) : []
  const hasUk = list.some(l => l === 'uk' || l.startsWith('uk-'))
  const hasEn = list.some(l => l === 'en' || l.startsWith('en-'))
  const kind = hasUk ? 'uk' : hasEn ? 'en' : 'none'
  return { kind, hasUk, hasEn, langs: list }
}

// Читає кеш мов (map videoId → string[]) з localStorage. На будь-яку
// неконсистентність повертає порожній обʼєкт.
/**
 *
 */
export function loadLangsCache(storage) {
  if (!storage || typeof storage.getItem !== 'function') return {}

  const raw = storage.getItem(STORAGE_KEY)
  if (typeof raw !== 'string') return {}

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const out = {}
  for (const [videoId, langs] of Object.entries(parsed)) {
    if (Array.isArray(langs) && langs.every(l => typeof l === 'string')) {
      out[videoId] = langs
    }
  }
  return out
}

// Зберігає весь map videoId → string[] у localStorage.
/**
 *
 */
export function saveLangsCache(storage, cache) {
  if (!storage || typeof storage.setItem !== 'function') return

  storage.setItem(STORAGE_KEY, JSON.stringify(cache))
}
