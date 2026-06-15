import { describe, expect, test } from 'vitest'
import { isAndroidUserAgent } from './platform.js'

describe('isAndroidUserAgent', () => {
  test('Android WebView UA', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
    expect(isAndroidUserAgent(ua)).toBe(true)
  })

  test('macOS Tauri WKWebView UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0'
    expect(isAndroidUserAgent(ua)).toBe(false)
  })

  test('iPhone (теж не Android, інша платформа)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    expect(isAndroidUserAgent(ua)).toBe(false)
  })

  test('case-insensitive match', () => {
    expect(isAndroidUserAgent('linux; android 13; ...')).toBe(true)
  })

  test('порожній рядок або не-рядок → false', () => {
    expect(isAndroidUserAgent('')).toBe(false)
    expect(isAndroidUserAgent()).toBe(false)
    expect(isAndroidUserAgent(null)).toBe(false)
  })
})
