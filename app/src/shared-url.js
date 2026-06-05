export const PENDING_SHARED_TEXT_STORAGE_KEY = 'myshare.sharedText'

const URL_PATTERN = /https?:\/\/[^\s<>"]+/iu

/**
 * Returns the first http(s) URL from Android shared text.
 * @param {unknown} value Shared payload value.
 * @returns {string} First URL or an empty string.
 */
export function extractSharedUrl(value) {
  if (typeof value !== 'string') return ''

  return value.match(URL_PATTERN)?.[0] ?? ''
}

/**
 * Reads Android share text saved before Vue mounted and removes the pending value.
 * @param {Storage | null | undefined} storage Browser storage adapter.
 * @returns {string} Pending shared text or an empty string.
 */
export function consumePendingSharedText(storage) {
  if (!storage || typeof storage.getItem !== 'function') return ''

  try {
    const text = storage.getItem(PENDING_SHARED_TEXT_STORAGE_KEY)
    if (typeof storage.removeItem === 'function') storage.removeItem(PENDING_SHARED_TEXT_STORAGE_KEY)
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}
