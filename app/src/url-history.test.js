import { expect, test } from 'vitest'
import { appendUrlToHistory, loadUrlHistory, saveUrlHistory, STORAGE_KEY } from './url-history.js'

function createStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value)
    }
  }
}

test('loadUrlHistory returns empty array when storage is empty', () => {
  expect(loadUrlHistory(createStorage())).toEqual([])
})

test('loadUrlHistory parses stored JSON array', () => {
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(['https://example.com/a', 'https://example.com/b'])
  })
  expect(loadUrlHistory(storage)).toEqual(['https://example.com/a', 'https://example.com/b'])
})

test('loadUrlHistory drops non-string and empty entries', () => {
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify(['https://example.com/a', 42, null, ''])
  })
  expect(loadUrlHistory(storage)).toEqual(['https://example.com/a'])
})

test('loadUrlHistory returns empty array on malformed JSON', () => {
  const storage = createStorage({ [STORAGE_KEY]: '{not json' })
  expect(loadUrlHistory(storage)).toEqual([])
})

test('loadUrlHistory returns empty array when stored value is not an array', () => {
  const storage = createStorage({ [STORAGE_KEY]: '"single"' })
  expect(loadUrlHistory(storage)).toEqual([])
})

test('loadUrlHistory ignores missing storage', () => {
  expect(loadUrlHistory(null)).toEqual([])
})

test('appendUrlToHistory prepends new URL', () => {
  expect(appendUrlToHistory(['https://example.com/b'], 'https://example.com/a')).toEqual([
    'https://example.com/a',
    'https://example.com/b'
  ])
})

test('appendUrlToHistory keeps history unchanged for empty string', () => {
  expect(appendUrlToHistory(['https://example.com/b'], '')).toEqual(['https://example.com/b'])
})

test('appendUrlToHistory keeps history unchanged for non-string', () => {
  expect(appendUrlToHistory(['https://example.com/b'], null)).toEqual(['https://example.com/b'])
})

test('saveUrlHistory writes JSON to storage', () => {
  const storage = createStorage()
  saveUrlHistory(storage, ['https://example.com/a'])
  expect(storage.getItem(STORAGE_KEY)).toBe('["https://example.com/a"]')
})

test('saveUrlHistory ignores missing storage', () => {
  expect(() => saveUrlHistory(null, ['https://example.com/a'])).not.toThrow()
})
