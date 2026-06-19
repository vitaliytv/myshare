import { describe, expect, test, vi } from 'vitest'

// Каталог тягне youtube.js / page-meta.js / omlx.js, які імпортують tauri-модулі.
// Мокаємо їх, щоб імпорт не падав; самі хендлери тут не викликаємо мережево
// (youtube_id — чиста функція; io-шлях тестуємо через підмінений transport).
// Маніфест/скоуп/agent-loop тепер тестуються в @7n/tauri-components — тут лише
// домен myshare: каталог, валідація вводу й локальний dispatch (з ctx).
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const { TOOLS, getTool } = await import('./catalog.js')
const { createDispatch, dispatch, validateInput } = await import('./dispatch.js')

const YT_URL = 'https://youtu.be/abcdefghijk'

describe('catalog', () => {
  test('кожен tool має tier, name, summary, input, run', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toBeTruthy()
      expect(tool.summary).toBeTruthy()
      expect(tool.input).toBeTypeOf('object')
      expect(tool.run).toBeTypeOf('function')
      expect(['read', 'write', 'destructive']).toContain(tool.tier)
    }
  })

  test('імена унікальні', () => {
    const names = TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('містить нові link-інструменти', () => {
    expect(getTool('list_links')?.tier).toBe('read')
    expect(getTool('add_link')?.tier).toBe('write')
  })

  test('getTool знаходить і повертає null для невідомого', () => {
    expect(getTool('youtube_id')?.name).toBe('youtube_id')
    expect(getTool('nope')).toBeNull()
  })
})

describe('validateInput', () => {
  test('бракує required → повідомлення', () => {
    expect(validateInput(getTool('youtube_id'), {})).toMatch('Missing required field: url')
  })

  test('невірний тип string/array', () => {
    expect(validateInput(getTool('youtube_id'), { url: 42 })).toMatch('must be a string')
    expect(validateInput(getTool('transcript'), { videoId: 'abcdefghijk', preferred: 'uk' })).toMatch('must be an array')
  })

  test('валідний вхід → null', () => {
    expect(validateInput(getTool('youtube_id'), { url: YT_URL })).toBeNull()
    expect(validateInput(getTool('transcript'), { videoId: 'abcdefghijk', preferred: ['uk'] })).toBeNull()
  })
})

describe('dispatch', () => {
  test('youtube_id → ok-конверт із videoId', async () => {
    const res = await dispatch('youtube_id', { url: YT_URL })
    expect(res).toEqual({ ok: true, output: { videoId: 'abcdefghijk' } })
  })

  test('невідомий tool → not_found', async () => {
    const res = await dispatch('nope', {})
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('not_found')
  })

  test('невалідний вхід → validation', async () => {
    const res = await dispatch('youtube_id', {})
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('validation')
  })

  test('виняток у transport → io', async () => {
    const boom = createDispatch(() => { throw new Error('boom') })
    const res = await boom('youtube_id', { url: YT_URL })
    expect(res).toEqual({ ok: false, error: { code: 'io', message: 'boom' } })
  })

  test('пробрасує ctx у transport (для onProgress/signal)', async () => {
    const seen = []
    const d = createDispatch((tool, input, ctx) => { seen.push(ctx); return {} })
    await d('youtube_id', { url: YT_URL }, { onProgress: 'fn' })
    expect(seen[0]).toEqual({ onProgress: 'fn' })
  })
})
