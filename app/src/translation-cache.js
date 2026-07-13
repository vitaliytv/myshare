// Кеш перекладів субтитрів у localStorage (map videoId → запис перекладу).
// Зберігаємо, щоб не ганяти omlx повторно по тому самому відео.
//
// Запис: { model: string, originalLang: string, segments: [{original, translated}],
//          deleted?: boolean, updatedAt?: number }. `deleted`/`updatedAt` підтримують
// sync-шар (app/src/sync/client.js) — append-only merge за `updatedAt` + tombstones.
// Зведені тексти оригіналу/перекладу відновлюються з segments на льоту.

export const STORAGE_KEY = 'myshare.translations'
export const SEQ_STORAGE_KEY = 'myshare.translations.seq'

/**
 * Перевіряє форму запису перекладу. `deleted`/`updatedAt` необов'язкові — старі записи
 * (до додавання sync) валідуються так само, як і нові. Чиста функція.
 * @param {object} entry запис перекладу для перевірки
 * @returns {boolean} true, якщо форма запису валідна
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

/**
 * Читає кеш перекладів. На будь-яку неконсистентність — порожній обʼєкт;
 * окремі биті записи відкидаються. Записи без `deleted`/`updatedAt` (старий формат)
 * дефолтяться в пам'яті й одразу персистяться назад одним викликом saveTranslations.
 * @param {Storage} storage сховище (напр. window.localStorage)
 * @returns {Record<string, object>} map videoId → запис перекладу
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
  let migrated = false
  for (const [videoId, entry] of Object.entries(parsed)) {
    if (!isValidEntry(entry)) continue
    if (typeof entry.deleted === 'boolean' && typeof entry.updatedAt === 'number') {
      out[videoId] = entry
    } else {
      out[videoId] = { ...entry, deleted: false, updatedAt: Date.now() }
      migrated = true
    }
  }

  if (migrated) saveTranslations(storage, out)
  return out
}

/**
 * Зберігає весь map videoId → запис у localStorage.
 * @param {Storage} storage сховище (напр. window.localStorage)
 * @param {Record<string, object>} cache map videoId → запис перекладу
 * @returns {void}
 */
export function saveTranslations(storage, cache) {
  if (!storage || typeof storage.setItem !== 'function') return

  storage.setItem(STORAGE_KEY, JSON.stringify(cache))
}

/**
 * Tombstone a cached translation (kept for merge history, not physically removed).
 * @param {Storage} storage where the cache is persisted
 * @param {Record<string, object>} cache current in-memory cache (as returned by loadTranslations)
 * @param {string} videoId the entry to tombstone
 * @returns {Record<string, object>} the updated cache
 */
export function removeTranslation(storage, cache, videoId) {
  const entry = cache[videoId]
  if (!entry) return cache
  const next = { ...cache, [videoId]: { ...entry, deleted: true, updatedAt: Date.now() } }
  saveTranslations(storage, next)
  return next
}

/**
 * Idempotent upsert-by-videoId used by the sync client to fold in server-pushed rows.
 * Persists via saveTranslations, mirroring removeTranslation's contract.
 * @param {Storage} storage where the cache is persisted
 * @param {Record<string, object>} cache current in-memory cache
 * @param {{videoId: string, entry: object|null, deleted: boolean}} mutation a relay journal row
 * @returns {Record<string, object>} the updated cache
 */
export function _applyRemoteTranslationMutation(storage, cache, { videoId, entry, deleted }) {
  const existing = cache[videoId]
  const updatedAt = Date.now()
  let next = cache
  if (deleted) {
    if (existing) next = { ...cache, [videoId]: { ...existing, deleted: true, updatedAt } }
  } else if (isValidEntry(entry)) {
    next = { ...cache, [videoId]: { ...entry, deleted: false, updatedAt } }
  }
  if (next !== cache) saveTranslations(storage, next)
  return next
}

/**
 * @param {Storage} storage where the sync cursor is persisted
 * @returns {number} the last relay seq folded into this cache
 */
export function _lastSyncedSeq(storage) {
  if (!storage || typeof storage.getItem !== 'function') return 0
  const raw = storage.getItem(SEQ_STORAGE_KEY)
  const seq = Number(raw)
  return Number.isFinite(seq) ? seq : 0
}

/**
 * @param {Storage} storage where the sync cursor is persisted
 * @param {number} seq the relay seq to record as synced
 * @returns {void}
 */
export function _setLastSyncedSeq(storage, seq) {
  if (!storage || typeof storage.setItem !== 'function') return
  storage.setItem(SEQ_STORAGE_KEY, String(seq))
}
