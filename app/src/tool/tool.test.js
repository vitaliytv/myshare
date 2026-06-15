import { describe, expect, test, vi } from 'vitest'

// Каталог тягне youtube.js / page-meta.js / omlx.js, які імпортують tauri-модулі.
// Мокаємо їх, щоб імпорт не падав; самі хендлери тут не викликаємо мережево
// (youtube_id — чиста функція; io-шлях тестуємо через підмінений transport).
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const { TOOLS, getTool } = await import('./catalog.js')
const { createDispatch, dispatch, validateInput } = await import('./dispatch.js')
const { toolManifest, listTools } = await import('./manifest.js')
const { allowsTier, scopedManifest, guardDispatch } = await import('./scope.js')

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
})

describe('manifest', () => {
  test('toolManifest → OpenAI function-calling форма', () => {
    const manifest = toolManifest()
    expect(manifest).toHaveLength(TOOLS.length)
    const ytId = manifest.find(m => m.function.name === 'youtube_id')
    expect(ytId.type).toBe('function')
    expect(ytId.function.parameters).toEqual({
      type: 'object',
      properties: { url: { type: 'string', description: expect.any(String) } },
      required: ['url'],
    })
  })

  test('toolManifest приймає allow-фільтр', () => {
    const only = toolManifest(t => t.name === 'translate')
    expect(only.map(m => m.function.name)).toEqual(['translate'])
  })

  test('listTools → name + summary', () => {
    const list = listTools()
    expect(list).toHaveLength(TOOLS.length)
    expect(list[0]).toEqual({ name: expect.any(String), summary: expect.any(String) })
  })
})

describe('scope', () => {
  test('allowsTier за актором', () => {
    expect(allowsTier({ kind: 'human' }, 'destructive')).toBe(true)
    expect(allowsTier({ kind: 'agent' }, 'write')).toBe(true)
    expect(allowsTier({ kind: 'agent' }, 'destructive')).toBe(false)
    expect(allowsTier({ kind: 'guest' }, 'write')).toBe(false) // невідомий → read
    expect(allowsTier(undefined, 'read')).toBe(true)
  })

  test('scopedManifest(guest) ховає те, що поза стелею', () => {
    const names = scopedManifest({ kind: 'guest' }).map(m => m.function.name)
    expect(names).toContain('youtube_id') // read дозволено
    expect(names).not.toContain('translate') // write — ні
  })

  test('guardDispatch блокує out-of-scope tool до запуску', async () => {
    const ran = vi.fn().mockResolvedValue({ ok: true, output: {} })
    const guarded = guardDispatch(ran, { kind: 'guest' })
    const res = await guarded('translate', { text: 'hi' })
    expect(res.error.code).toBe('forbidden')
    expect(ran).not.toHaveBeenCalled()
  })

  test('guardDispatch пропускає дозволене', async () => {
    const ran = vi.fn().mockResolvedValue({ ok: true, output: { videoId: 'x' } })
    const guarded = guardDispatch(ran, { kind: 'agent' })
    await guarded('youtube_id', { url: YT_URL })
    expect(ran).toHaveBeenCalledWith('youtube_id', { url: YT_URL })
  })
})
