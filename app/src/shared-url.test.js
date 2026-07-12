import { expect, test } from 'vitest'
import { PENDING_SHARED_TEXT_STORAGE_KEY, consumePendingSharedText, extractSharedUrl } from './shared-url.js'

test('extractSharedUrl returns direct URL', () => {
  expect(extractSharedUrl('https://example.com/page')).toBe('https://example.com/page')
})

test('extractSharedUrl accepts http:// scheme', () => {
  expect(extractSharedUrl('https://example.com/page')).toBe('https://example.com/page')
})

test('extractSharedUrl returns first URL from shared text', () => {
  expect(extractSharedUrl('Подивись https://example.com/page?x=1 далі http://example.org')).toBe(
    'https://example.com/page?x=1'
  )
})

test('extractSharedUrl returns empty string when text has no URL', () => {
  expect(extractSharedUrl('просто текст')).toBe('')
})

test('extractSharedUrl ignores non-string values', () => {
  expect(extractSharedUrl(null)).toBe('')
})

test('consumePendingSharedText reads and removes pending shared text', () => {
  const store = { [PENDING_SHARED_TEXT_STORAGE_KEY]: 'https://example.com/shared' }
  const storage = {
    getItem: key => store[key] ?? null,
    removeItem: key => {
      delete store[key]
    }
  }

  expect(consumePendingSharedText(storage)).toBe('https://example.com/shared')
  expect(store).toEqual({})
})

test('consumePendingSharedText returns empty string for missing storage', () => {
  expect(consumePendingSharedText(null)).toBe('')
})

test('consumePendingSharedText tolerates storage errors', () => {
  const storage = {
    getItem: () => {
      throw new Error('blocked')
    }
  }

  expect(consumePendingSharedText(storage)).toBe('')
})
