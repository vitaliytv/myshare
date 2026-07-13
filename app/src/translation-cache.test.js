import { describe, expect, test } from 'vitest'
import {
  _applyRemoteTranslationMutation,
  _lastSyncedSeq,
  _setLastSyncedSeq,
  isValidEntry,
  loadTranslations,
  removeTranslation,
  saveTranslations,
  STORAGE_KEY
} from './translation-cache.js'

/**
 * @param {Record<string, string>} [initial] pre-seeded key/value pairs
 * @returns {Storage} a minimal in-memory localStorage double
 */
function makeStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    _store: store
  }
}

const goodEntry = {
  model: 'gemma4:e4b',
  originalLang: 'en',
  segments: [{ original: 'Hello', translated: 'Привіт' }]
}

describe('isValidEntry', () => {
  test('валідний запис', () => {
    expect(isValidEntry(goodEntry)).toBe(true)
  })
  test('відкидає без segments / з битими segments', () => {
    expect(isValidEntry(null)).toBe(false)
    expect(isValidEntry({})).toBe(false)
    expect(isValidEntry({ segments: 'x' })).toBe(false)
    expect(isValidEntry({ segments: [{ original: 'a' }] })).toBe(false)
    expect(isValidEntry({ segments: [{ original: 1, translated: 2 }] })).toBe(false)
  })
})

describe('loadTranslations / saveTranslations', () => {
  test('round-trip', () => {
    const storage = makeStorage()
    const stored = { ...goodEntry, deleted: false, updatedAt: 123 }
    saveTranslations(storage, { abc12345678: stored })
    expect(loadTranslations(storage)).toEqual({ abc12345678: stored })
  })

  test('відсутній ключ → {}', () => {
    expect(loadTranslations(makeStorage())).toEqual({})
  })

  test('некоректний JSON → {}', () => {
    expect(loadTranslations(makeStorage({ [STORAGE_KEY]: '{bad' }))).toEqual({})
  })

  test('масив замість обʼєкта → {}', () => {
    expect(loadTranslations(makeStorage({ [STORAGE_KEY]: '[]' }))).toEqual({})
  })

  test('відкидає биті записи, лишає валідні', () => {
    const raw = JSON.stringify({ ok: goodEntry, bad: { segments: [{ original: 1 }] } })
    const loaded = loadTranslations(makeStorage({ [STORAGE_KEY]: raw }))
    expect(Object.keys(loaded)).toEqual(['ok'])
    expect(loaded.ok.model).toBe(goodEntry.model)
  })

  test('відсутнє storage не падає', () => {
    expect(loadTranslations(null)).toEqual({})
    expect(() => saveTranslations(null, {})).not.toThrow()
  })

  test('мігрує старий запис (без deleted/updatedAt) і персистить назад', () => {
    const storage = makeStorage({ [STORAGE_KEY]: JSON.stringify({ old: goodEntry }) })
    const loaded = loadTranslations(storage)
    expect(loaded.old.deleted).toBe(false)
    expect(typeof loaded.old.updatedAt).toBe('number')

    const persisted = JSON.parse(storage.getItem(STORAGE_KEY))
    expect(persisted.old.deleted).toBe(false)
  })

  test('не перезаписує вже мігровані записи повторно', () => {
    const storage = makeStorage()
    saveTranslations(storage, { ok: { ...goodEntry, deleted: false, updatedAt: 123 } })
    const loaded = loadTranslations(storage)
    expect(loaded.ok.updatedAt).toBe(123)
  })
})

describe('removeTranslation', () => {
  test('tombstones без фізичного видалення', () => {
    const storage = makeStorage()
    let cache = { vid: { ...goodEntry, deleted: false, updatedAt: 1 } }
    cache = removeTranslation(storage, cache, 'vid')
    expect(cache.vid.deleted).toBe(true)
    expect(loadTranslations(storage).vid.deleted).toBe(true)
  })

  test('no-op для невідомого videoId', () => {
    const storage = makeStorage()
    const cache = {}
    expect(removeTranslation(storage, cache, 'missing')).toBe(cache)
  })
})

describe('_applyRemoteTranslationMutation', () => {
  test('додає новий валідний запис і персистить', () => {
    const storage = makeStorage()
    const cache = _applyRemoteTranslationMutation(storage, {}, { videoId: 'vid', entry: goodEntry, deleted: false })
    expect(cache.vid.deleted).toBe(false)
    expect(loadTranslations(storage).vid).toBeTruthy()
  })

  test('ідемпотентне повторне застосування того самого upsert', () => {
    const storage = makeStorage()
    let cache = {}
    cache = _applyRemoteTranslationMutation(storage, cache, { videoId: 'vid', entry: goodEntry, deleted: false })
    cache = _applyRemoteTranslationMutation(storage, cache, { videoId: 'vid', entry: goodEntry, deleted: false })
    expect(Object.keys(cache)).toEqual(['vid'])
  })

  test('tombstone для відомого videoId', () => {
    const storage = makeStorage()
    let cache = _applyRemoteTranslationMutation(storage, {}, { videoId: 'vid', entry: goodEntry, deleted: false })
    cache = _applyRemoteTranslationMutation(storage, cache, { videoId: 'vid', entry: null, deleted: true })
    expect(cache.vid.deleted).toBe(true)
  })

  test('tombstone невідомого videoId — no-op', () => {
    const storage = makeStorage()
    const cache = _applyRemoteTranslationMutation(storage, {}, { videoId: 'missing', entry: null, deleted: true })
    expect(cache).toEqual({})
  })
})

describe('_lastSyncedSeq / _setLastSyncedSeq', () => {
  test('round-trip, дефолт 0', () => {
    const storage = makeStorage()
    expect(_lastSyncedSeq(storage)).toBe(0)
    _setLastSyncedSeq(storage, 7)
    expect(_lastSyncedSeq(storage)).toBe(7)
  })
})
