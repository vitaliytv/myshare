export const STORAGE_KEY = 'myshare.sharedUrls'

export function loadUrlHistory(storage) {
  if (!storage || typeof storage.getItem !== 'function') return []

  const raw = storage.getItem(STORAGE_KEY)
  if (typeof raw !== 'string') return []

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  return parsed.filter((url) => typeof url === 'string' && url.length > 0)
}

export function saveUrlHistory(storage, history) {
  if (!storage || typeof storage.setItem !== 'function') return

  storage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function appendUrlToHistory(history, url) {
  if (typeof url !== 'string' || url.length === 0) return history

  return [url, ...history]
}
