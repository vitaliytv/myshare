import { describe, expect, test } from 'vitest'
import { captionStatus, loadLangsCache, saveLangsCache, STORAGE_KEY } from './caption-langs.js'

describe('captionStatus', () => {
  test('uk перемагає, навіть якщо є en', () => {
    const s = captionStatus(['en', 'uk', 'de'])
    expect(s.kind).toBe('uk')
    expect(s.hasUk).toBe(true)
    expect(s.hasEn).toBe(true)
  })

  test('en коли нема uk', () => {
    const s = captionStatus(['de', 'en', 'fr'])
    expect(s.kind).toBe('en')
    expect(s.hasUk).toBe(false)
    expect(s.hasEn).toBe(true)
  })

  test('none коли нема ні uk, ні en', () => {
    const s = captionStatus(['de', 'fr'])
    expect(s.kind).toBe('none')
  })

  test('порожній список → none', () => {
    expect(captionStatus([]).kind).toBe('none')
    expect(captionStatus(null).kind).toBe('none')
    expect(captionStatus().kind).toBe('none')
  })

  test('регіональні варіанти нормалізуються (uk-UA, en-US)', () => {
    expect(captionStatus(['uk-UA']).kind).toBe('uk')
    expect(captionStatus(['EN-US']).kind).toBe('en')
  })
})

function makeStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v)
    },
    _store: store
  }
}

describe('loadLangsCache / saveLangsCache', () => {
  test('round-trip', () => {
    const storage = makeStorage()
    saveLangsCache(storage, { abc: ['uk', 'en'], def: [] })
    expect(loadLangsCache(storage)).toEqual({ abc: ['uk', 'en'], def: [] })
  })

  test('відсутній ключ → {}', () => {
    expect(loadLangsCache(makeStorage())).toEqual({})
  })

  test('некоректний JSON → {}', () => {
    expect(loadLangsCache(makeStorage({ [STORAGE_KEY]: '{not json' }))).toEqual({})
  })

  test('масив замість обʼєкта → {}', () => {
    expect(loadLangsCache(makeStorage({ [STORAGE_KEY]: '["a","b"]' }))).toEqual({})
  })

  test('відкидає записи з не-рядковими мовами', () => {
    const raw = JSON.stringify({ ok: ['uk'], bad: [1, 2], nope: 'x' })
    expect(loadLangsCache(makeStorage({ [STORAGE_KEY]: raw }))).toEqual({ ok: ['uk'] })
  })

  test('відсутнє/невалідне storage не падає', () => {
    expect(loadLangsCache(null)).toEqual({})
    expect(() => saveLangsCache(null, {})).not.toThrow()
  })
})
