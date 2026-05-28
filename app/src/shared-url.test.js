import { expect, test } from 'vitest'
import { extractSharedUrl } from './shared-url.js'

test('extractSharedUrl returns direct URL', () => {
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
