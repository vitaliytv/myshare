// Кеш перекладів субтитрів у localStorage (map videoId → запис перекладу).
// Зберігаємо, щоб не ганяти omlx повторно по тому самому відео.
//
// Запис: { model: string, originalLang: string, segments: [{original, translated}] }.
// Зведені тексти оригіналу/перекладу відновлюються з segments на льоту.

export const STORAGE_KEY = 'myshare.translations'

// Перевіряє форму запису перекладу. Чиста функція.
/**
 *
 */
export function isValidEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    Array.isArray(entry.segments) &&
    entry.segments.every(
      s => s !== null && typeof s === 'object' && typeof s.original === 'string' && typeof s.translated === 'string'
    )
  )
}

// Читає кеш перекладів. На будь-яку неконсистентність — порожній обʼєкт;
// окремі биті записи відкидаються.
/**
 *
 */
export function loadTranslations(storage) {
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
  for (const [videoId, entry] of Object.entries(parsed)) {
    if (isValidEntry(entry)) out[videoId] = entry
  }
  return out
}

// Зберігає весь map videoId → запис у localStorage.
/**
 *
 */
export function saveTranslations(storage, cache) {
  if (!storage || typeof storage.setItem !== 'function') return

  storage.setItem(STORAGE_KEY, JSON.stringify(cache))
}
