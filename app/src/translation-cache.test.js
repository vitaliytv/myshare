import { describe, expect, test } from 'vitest'
import { isValidEntry, loadTranslations, saveTranslations, STORAGE_KEY } from './translation-cache.js'

/**
 *
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
    saveTranslations(storage, { abc12345678: goodEntry })
    expect(loadTranslations(storage)).toEqual({ abc12345678: goodEntry })
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
    expect(loadTranslations(makeStorage({ [STORAGE_KEY]: raw }))).toEqual({ ok: goodEntry })
  })

  test('відсутнє storage не падає', () => {
    expect(loadTranslations(null)).toEqual({})
    expect(() => saveTranslations(null, {})).not.toThrow()
  })
})
