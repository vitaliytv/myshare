import { describe, expect, test, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
// platform.js читає navigator.userAgent; для selectChat передаємо явний android.

const { runAgent, createOpenAiChat, createLiteRtChat, selectChat, createSystemPrompt } = await import('./llm.js')

// Хелпери для OpenAI-shaped повідомлень.
function assistantText(content) {
  return { role: 'assistant', content }
}
function assistantCall(name, args, id = 'call_1') {
  return { role: 'assistant', content: '', tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] }
}

describe('runAgent', () => {
  test('викликає tool, згодовує конверт, завершує на текстовій відповіді', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(assistantCall('youtube_id', { url: 'https://youtu.be/abcdefghijk' }))
      .mockResolvedValueOnce(assistantText('Готово'))
    const dispatch = vi.fn(async () => ({ ok: true, output: { videoId: 'abcdefghijk' } }))

    const result = await runAgent({ prompt: 'extract id', dispatch, chat, tools: [] })

    expect(dispatch).toHaveBeenCalledWith('youtube_id', { url: 'https://youtu.be/abcdefghijk' })
    expect(result.content).toBe('Готово')
    expect(result.steps).toBe(2)
    expect(result.trace).toHaveLength(1)
    expect(result.trace[0].envelope.output.videoId).toBe('abcdefghijk')
    // tool-результат потрапив у messages як role:'tool'
    expect(result.messages.some(m => m.role === 'tool')).toBe(true)
  })

  test('зупиняється на maxSteps якщо модель не перестає кликати tool', async () => {
    const chat = vi.fn(async () => assistantCall('youtube_id', { url: 'https://youtu.be/abcdefghijk' }))
    const dispatch = vi.fn(async () => ({ ok: true, output: {} }))
    const result = await runAgent({ prompt: 'loop', dispatch, chat, maxSteps: 2, tools: [] })
    expect(result.stopped).toBe('max_steps')
    expect(chat).toHaveBeenCalledTimes(2)
  })

  test('битий JSON в arguments → dispatch дістає {}', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce({ role: 'assistant', content: '', tool_calls: [{ id: 'c', function: { name: 'youtube_id', arguments: '{bad' } }] })
      .mockResolvedValueOnce(assistantText('ok'))
    const dispatch = vi.fn(async () => ({ ok: false, error: { code: 'validation', message: 'x' } }))
    await runAgent({ prompt: 'x', dispatch, chat, tools: [] })
    expect(dispatch).toHaveBeenCalledWith('youtube_id', {})
  })
})

describe('createOpenAiChat', () => {
  test('POST-ить messages+tools і повертає assistant message', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: assistantText('hi') }] }) }))
    const chat = createOpenAiChat({ model: 'gemma', fetchFn })
    const msg = await chat({ messages: [{ role: 'user', content: 'q' }], tools: [{ type: 'function' }] })
    expect(msg.content).toBe('hi')
    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toMatch(/\/chat\/completions$/)
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('gemma')
    expect(body.tool_choice).toBe('auto')
    expect(body.tools).toEqual([{ type: 'function' }])
  })

  test('не-ok → кидає', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503 }))
    const chat = createOpenAiChat({ model: 'gemma', fetchFn })
    await expect(chat({ messages: [], tools: [] })).rejects.toThrow(/503/)
  })
})

describe('createLiteRtChat', () => {
  test('кличе Tauri-команду litert_chat і повертає message', async () => {
    const invoke = vi.fn(async () => assistantText('привіт'))
    const chat = createLiteRtChat({ invoke })
    const msg = await chat({ messages: [{ role: 'user', content: 'q' }], tools: [] })
    expect(msg.content).toBe('привіт')
    expect(invoke).toHaveBeenCalledWith('litert_chat', { model: 'gemma4-e2b', messages: [{ role: 'user', content: 'q' }], tools: [] })
  })
})

describe('selectChat', () => {
  test('android → LiteRT-LM (invoke)', async () => {
    const invoke = vi.fn(async () => assistantText('a'))
    const fetchFn = vi.fn()
    const chat = selectChat({ android: true, invoke, fetchFn })
    await chat({ messages: [], tools: [] })
    expect(invoke).toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  test('desktop → omlx (fetch)', async () => {
    const invoke = vi.fn()
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: assistantText('b') }] }) }))
    const chat = selectChat({ android: false, model: 'gemma', invoke, fetchFn })
    await chat({ messages: [], tools: [] })
    expect(fetchFn).toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('createSystemPrompt', () => {
  test('згадує домен і tool-дисципліну', () => {
    const p = createSystemPrompt()
    expect(p).toMatch(/myshare/)
    expect(p).toMatch(/one tool at a time/i)
  })
})
