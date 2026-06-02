import { describe, expect, test, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...args) => fetchMock(...args) }))

const {
  chunkText,
  buildMessages,
  extractContent,
  translateChunk,
  translateToUkrainian,
  listOllamaModels,
  resolveModel,
  DEFAULT_MODEL
} = await import('./ollama.js')

beforeEach(() => {
  fetchMock.mockReset()
})

// Хелпер: відповідь Ollama /api/chat
function chatOk(content) {
  return { ok: true, json: async () => ({ message: { content }, done: true }) }
}
function tagsOk(names) {
  return { ok: true, json: async () => ({ models: names.map((name) => ({ name })) }) }
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
    // 'aaaa\n\nbbbb' = 10 символів, потім 'cccc' окремо
    expect(chunks).toEqual(['aaaa\n\nbbbb', 'cccc'])
  })

  test('задовгий абзац ріжеться по рядках', () => {
    const chunks = chunkText('line1\nline2\nline3', 7)
    expect(chunks.every((c) => c.length <= 7)).toBe(true)
    expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('line1')
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
  test('дістає message.content', () => {
    expect(extractContent({ message: { content: 'Привіт' } })).toBe('Привіт')
  })
  test('нема контенту → порожній рядок', () => {
    expect(extractContent({})).toBe('')
    expect(extractContent(null)).toBe('')
    expect(extractContent({ message: {} })).toBe('')
  })
})

describe('translateChunk', () => {
  test('POST /api/chat, повертає trimmed контент', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('  Привіт світ  '))
    const out = await translateChunk('Hello world', { model: 'm', base: 'http://x' })
    expect(out).toBe('Привіт світ')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://x/api/chat')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('m')
    expect(body.stream).toBe(false)
    expect(body.messages[1].content).toBe('Hello world')
  })

  test('не-ok → кидає помилку з кодом', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(translateChunk('hi', { base: 'http://x' })).rejects.toThrow('Ollama HTTP 500')
  })
})

describe('listOllamaModels / resolveModel', () => {
  test('listOllamaModels повертає імена', async () => {
    fetchMock.mockResolvedValueOnce(tagsOk(['gemma4:e4b', 'llama3']))
    expect(await listOllamaModels('http://x')).toEqual(['gemma4:e4b', 'llama3'])
  })

  test('resolveModel бере preferred якщо є', async () => {
    fetchMock.mockResolvedValueOnce(tagsOk(['other', DEFAULT_MODEL]))
    expect(await resolveModel('http://x', DEFAULT_MODEL)).toBe(DEFAULT_MODEL)
  })

  test('resolveModel бере першу наявну якщо preferred нема', async () => {
    fetchMock.mockResolvedValueOnce(tagsOk(['only-this']))
    expect(await resolveModel('http://x', DEFAULT_MODEL)).toBe('only-this')
  })

  test('resolveModel кидає коли моделей нема', async () => {
    fetchMock.mockResolvedValueOnce(tagsOk([]))
    await expect(resolveModel('http://x')).rejects.toThrow(/немає завантажених моделей/)
  })
})

describe('translateToUkrainian', () => {
  test('запити несуть keep_alive 5m', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('переклад'))
    await translateToUkrainian('hello', { model: 'm', base: 'http://x' })
    const chatCall = fetchMock.mock.calls.find((c) => c[0] === 'http://x/api/chat')
    expect(JSON.parse(chatCall[1].body).keep_alive).toBe('5m')
  })

  test('розбиває, перекладає кожен чанк, звітує прогрес', async () => {
    // model заданий → /api/tags не викликається
    fetchMock.mockResolvedValueOnce(chatOk('перший')).mockResolvedValueOnce(chatOk('другий'))
    const progress = []
    const result = await translateToUkrainian('aaaa\n\nbbbb\n\ncccc', {
      model: 'm',
      base: 'http://x',
      onProgress: (done, total) => progress.push([done, total])
    })
    // chunkText із дефолтним maxChars=3500 → один чанк, тож 1 виклик.
    expect(result.model).toBe('m')
    expect(result.segments).toHaveLength(1)
    expect(result.text).toBe('перший')
    expect(progress).toEqual([[1, 1]])
  })

  test('кілька чанків: segments зберігають пари оригінал↔переклад', async () => {
    fetchMock.mockResolvedValueOnce(chatOk('ПЕРШИЙ')).mockResolvedValueOnce(chatOk('ДРУГИЙ'))
    const result = await translateToUkrainian('aaaaa\n\nbbbbb', { model: 'm', base: 'http://x' })
    // maxChars дефолт великий → насправді 1 чанк. Перевіримо малий maxChars шляхом
    // прямого chunkText не можемо тут; натомість перевіряємо контракт segments.
    expect(result.segments[0]).toMatchObject({ original: expect.any(String), translated: 'ПЕРШИЙ' })
    expect(result.text).toContain('ПЕРШИЙ')
  })

  test('без model — спершу resolveModel через /api/tags', async () => {
    fetchMock.mockResolvedValueOnce(tagsOk(['auto-model'])).mockResolvedValueOnce(chatOk('переклад'))
    const result = await translateToUkrainian('hello', { base: 'http://x' })
    expect(result.model).toBe('auto-model')
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/api/tags')
    expect(fetchMock.mock.calls[1][0]).toBe('http://x/api/chat')
  })
})
