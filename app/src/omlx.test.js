import { describe, expect, test, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...args) => fetchMock(...args) }))

const {
  chunkText,
  buildMessages,
  extractContent,
  translateChunk,
  translateToUkrainian,
  listOmlxModels,
  resolveModel,
  DEFAULT_MODEL
} = await import('./omlx.js')

beforeEach(() => {
  fetchMock.mockReset()
})

// Хелпер: відповідь omlx /v1/chat/completions (OpenAI-compatible)
/**
 *
 */
function chatOk(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }) }
}
/**
 *
 */
function modelsOk(ids) {
  return { ok: true, json: async () => ({ data: ids.map(id => ({ id })) }) }
}

describe('chunkText', () => {
  test('короткий текст → один чанк', () => {
    expect(chunkText('hello world')).toEqual(['hello world'])
  })

  test('порожній / пробіли → []', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
    expect(chunkText(null)).toEqual([])
  })

  test('абзаци зливаються поки влазять у maxChars', () => {
    const chunks = chunkText('aaaa\n\nbbbb\n\ncccc', 10)
    expect(chunks).toEqual(['aaaa\n\nbbbb', 'cccc'])
  })

  test('задовгий абзац ріжеться по рядках', () => {
    const chunks = chunkText('line1\nline2\nline3', 7)
    expect(chunks.every(c => c.length <= 7)).toBe(true)
    expect(chunks.join('\n').replaceAll(/\n+/g, '\n')).toContain('line1')
  })

  test('задовгий суцільний рядок жорстко ріжеться по символах', () => {
    const chunks = chunkText('abcdefghij', 4)
    expect(chunks).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('buildMessages', () => {
  test('system + user із чанком', () => {
    const msgs = buildMessages('Hello')
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toMatch(/Ukrainian/)
    expect(msgs[1]).toEqual({ role: 'user', content: 'Hello' })
  })
})

describe('extractContent', () => {
  test('дістає choices[0].message.content', () => {
    expect(extractContent({ choices: [{ message: { content: 'Привіт' } }] })).toBe('Привіт')
  })
  test('нема контенту → порожній рядок', () => {
    expect(extractContent({})).toBe('')
    expect(extractContent(null)).toBe('')
    expect(extractContent({ choices: [] })).toBe('')
    expect(extractContent({ choices: [{ message: {} }] })).toBe('')
  })
})

describe('translateChunk', () => {
  test('POST /v1/chat/completions, повертає trimmed контент', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('  Привіт світ  '))
    const out = await translateChunk('Hello world', { model: 'm', base: 'https://x/v1' })
    expect(out).toBe('Привіт світ')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x/v1/chat/completions')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('m')
    expect(body.stream).toBe(false)
    expect(body.temperature).toBe(0.2)
    expect(body.messages[1].content).toBe('Hello world')
  })

  test('apiKey → Authorization: Bearer', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('ok'))
    await translateChunk('hi', { model: 'm', base: 'https://x/v1', apiKey: 'secret' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer secret')
  })

  test('без apiKey — без Authorization', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('ok'))
    await translateChunk('hi', { model: 'm', base: 'https://x/v1' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  test('не-ok → кидає помилку з кодом', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(translateChunk('hi', { base: 'https://x/v1' })).rejects.toThrow('omlx HTTP 500')
  })
})

describe('listOmlxModels / resolveModel', () => {
  test('listOmlxModels повертає id моделей з data[]', async () => {
    fetchMock.mockResolvedValueOnce(modelsOk(['gemma-4-e4b-it-OptiQ-4bit', 'llama3-8b-4bit']))
    expect(await listOmlxModels('https://x/v1')).toEqual(['gemma-4-e4b-it-OptiQ-4bit', 'llama3-8b-4bit'])
    expect(fetchMock.mock.calls[0][0]).toBe('https://x/v1/models')
  })

  test('listOmlxModels не-ok → throw', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(listOmlxModels('https://x/v1')).rejects.toThrow('omlx HTTP 503')
  })

  test('resolveModel бере preferred якщо є', async () => {
    fetchMock.mockResolvedValueOnce(modelsOk(['other', DEFAULT_MODEL]))
    expect(await resolveModel('https://x/v1', DEFAULT_MODEL)).toBe(DEFAULT_MODEL)
  })

  test('resolveModel бере першу наявну якщо preferred нема', async () => {
    fetchMock.mockResolvedValueOnce(modelsOk(['only-this']))
    expect(await resolveModel('https://x/v1', DEFAULT_MODEL)).toBe('only-this')
  })

  test('resolveModel кидає коли моделей нема', async () => {
    fetchMock.mockResolvedValueOnce(modelsOk([]))
    await expect(resolveModel('https://x/v1')).rejects.toThrow(/немає завантажених моделей/)
  })
})

describe('translateToUkrainian', () => {
  test('запити несуть temperature 0.2', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('переклад'))
    await translateToUkrainian('hello', { model: 'm', base: 'https://x/v1' })
    const chatCall = fetchMock.mock.calls.find(c => c[0] === 'https://x/v1/chat/completions')
    expect(JSON.parse(chatCall[1].body).temperature).toBe(0.2)
  })

  test('розбиває, перекладає кожен чанк, звітує прогрес', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('перший')).mockResolvedValueOnce(chatOk('другий'))
    const progress = []
    const result = await translateToUkrainian('aaaa\n\nbbbb\n\ncccc', {
      model: 'm',
      base: 'https://x/v1',
      onProgress: (done, total) => progress.push([done, total])
    })
    expect(result.model).toBe('m')
    expect(result.segments).toHaveLength(1)
    expect(result.text).toBe('перший')
    expect(progress).toEqual([[1, 1]])
  })

  test('segments зберігають пари оригінал↔переклад', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('ПЕРШИЙ'))
    const result = await translateToUkrainian('aaaaa\n\nbbbbb', { model: 'm', base: 'https://x/v1' })
    expect(result.segments[0]).toMatchObject({ original: expect.any(String), translated: 'ПЕРШИЙ' })
    expect(result.text).toContain('ПЕРШИЙ')
  })

  test('без model — спершу resolveModel через /v1/models', async () => {
    fetchMock.mockResolvedValueOnce(modelsOk(['auto-model'])).mockResolvedValueOnce(chatOk('переклад'))
    const result = await translateToUkrainian('hello', { base: 'https://x/v1' })
    expect(result.model).toBe('auto-model')
    expect(fetchMock.mock.calls[0][0]).toBe('https://x/v1/models')
    expect(fetchMock.mock.calls[1][0]).toBe('https://x/v1/chat/completions')
  })
})
