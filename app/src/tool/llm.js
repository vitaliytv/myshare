import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { isAndroidPlatform } from '../platform.js'
import { OMLX_BASE_URL } from '../omlx.js'
import { scopedManifest } from './scope.js'

/**
 * Build the system prompt for the myshare gateway agent.
 * @returns {string} system prompt
 */
export function createSystemPrompt() {
  return [
    'You are the myshare agent. You help the user work with shared links.',
    'Use the provided tools to extract YouTube ids, list subtitle languages, fetch transcripts and page metadata, and translate English text into Ukrainian.',
    'Call one tool at a time and wait for its result before the next.',
    'If a request is ambiguous, reply with a clarifying question and NO tool call.',
    'When done, reply with a short plain-text summary in Ukrainian and no tool call.',
  ].join('\n')
}

const DEFAULT_SYSTEM = createSystemPrompt()

/**
 * Run the tool-calling loop until the model answers without a tool call.
 * @param {object} params loop parameters
 * @param {string} [params.prompt] user request (fresh start)
 * @param {object[]} [params.messages] existing conversation to resume (takes priority over prompt)
 * @param {(name: string, input: object) => Promise<object>} params.dispatch tool dispatcher returning an envelope
 * @param {(req: {messages: object[], tools: object[]}) => Promise<object>} params.chat model call returning an assistant message
 * @param {number} [params.maxSteps] safety cap on loop iterations
 * @param {string} [params.system] system prompt override (only used when building fresh from prompt)
 * @param {object[]} [params.tools] LLM tool manifest (default: agent-scoped)
 * @returns {Promise<{content: string, steps: number, trace: object[], messages: object[], stopped?: string}>}
 */
export async function runAgent({ prompt, messages: initialMessages, dispatch, chat, maxSteps = 6, system = DEFAULT_SYSTEM, tools = scopedManifest({ kind: 'agent' }) }) {
  const messages = initialMessages
    ? [...initialMessages]
    : [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ]
  const trace = []

  for (let step = 0; step < maxSteps; step++) {
    const reply = await chat({ messages, tools })
    messages.push(reply)

    const calls = reply.tool_calls ?? []
    if (calls.length === 0) {
      return { content: reply.content ?? '', steps: step + 1, trace, messages }
    }

    for (const call of calls) {
      let input = {}
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      }
      catch {
        // leave input empty — dispatch's schema validation reports the problem
      }
      const envelope = await dispatch(call.function.name, input)
      trace.push({ tool: call.function.name, input, envelope })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(envelope) })
    }
  }

  return { content: '', steps: maxSteps, trace, messages, stopped: 'max_steps' }
}

/**
 * Build a `chat` function that calls an OpenAI-compatible endpoint (omlx, desktop).
 * @param {object} params config
 * @param {string} [params.baseUrl] base URL incl. /v1 (default: OMLX_BASE_URL)
 * @param {string} params.model served model id
 * @param {string} [params.apiKey] optional bearer token
 * @param {typeof fetch} [params.fetchFn] fetch implementation (injectable for tests; default tauri-http)
 * @returns {(req: {messages: object[], tools: object[]}) => Promise<object>} chat function
 */
export function createOpenAiChat({ baseUrl = OMLX_BASE_URL, model, apiKey, fetchFn = tauriFetch }) {
  return async function chat({ messages, tools }) {
    const response = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: false }),
    })
    if (!response.ok) {
      throw new Error(`omlx HTTP ${response.status}`)
    }
    const data = await response.json()
    return data.choices[0].message
  }
}

/**
 * Build a `chat` function backed by on-device LiteRT-LM (Android, Gemma4-E2B).
 *
 * The model runs natively via the Rust `litert_chat` Tauri command — there is no
 * localhost HTTP server on a phone. The command must accept { messages, tools }
 * and return an OpenAI-shaped assistant message ({ role, content, tool_calls }).
 *
 * NB: the Rust `litert_chat` command + LiteRT-LM runtime/model bundling are a
 * follow-up (see ADR n-tool-surface). This factory is the JS-side seam: until
 * the command exists, calls reject with the Tauri "command not found" error.
 *
 * @param {object} params config
 * @param {string} [params.model] model id to load (default: gemma4-e2b)
 * @param {(cmd: string, args: object) => Promise<object>} [params.invoke] Tauri invoke (injectable for tests)
 * @returns {(req: {messages: object[], tools: object[]}) => Promise<object>} chat function
 */
export function createLiteRtChat({ model = 'gemma4-e2b', invoke = tauriInvoke } = {}) {
  return async function chat({ messages, tools }) {
    return invoke('litert_chat', { model, messages, tools })
  }
}

/**
 * Pick the right chat adapter for the current platform: LiteRT-LM on Android,
 * omlx (OpenAI-compatible) on desktop.
 * @param {object} [params] config forwarded to the chosen adapter
 * @param {boolean} [params.android] platform override (default: isAndroidPlatform())
 * @returns {(req: {messages: object[], tools: object[]}) => Promise<object>} chat function
 */
export function selectChat({ android = isAndroidPlatform(), model, baseUrl, apiKey, fetchFn, invoke } = {}) {
  return android
    ? createLiteRtChat({ model, invoke })
    : createOpenAiChat({ baseUrl, model, apiKey, fetchFn })
}
