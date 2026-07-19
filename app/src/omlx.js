// Переклад EN→UK субтитрів через локальний omlx (OpenAI-compatible MLX
// сервер на Apple Silicon, http://127.0.0.1:8000/v1). HTTP іде через
// tauri-plugin-http — endpoint слухає localhost, без CORS-морочень.
//
// Транскрипт може бути великим, тож ріжемо його на чанки і перекладаємо
// послідовно, зберігаючи пари «оригінал ↔ переклад» (segments) для
// порівняння. Результат кешується викликачем (translation-cache.js).
//
// Це окрема, не-агентна фіча (пряма омлх-розмова для перекладу, не через
// ACP), тож resolveOmlxBaseUrlCached/isDirectOmlxUrl тут вендорені
// напряму — @7n/tauri-components@0.11.0 прибрав увесь omlx/runAgent-шар
// разом з цими утилітами (useAcpAgent() тепер єдиний агентний шлях; ця
// omlx-розмова для перекладу з ним не пов'язана і мігрувати нема на що).

import { fetch } from '@tauri-apps/plugin-http'

export const OMLX_BASE_URL = 'http://127.0.0.1:8000/v1'
const PROXY_OMLX_BASE_URL = 'http://127.0.0.1:8088/v1'
const PROBE_TIMEOUT_MS = 400
const PROBE_TTL_MS = 12_000

// Модель за замовчуванням. У myshare omlx бере її лише як preferred — якщо
// не завантажена, `resolveModel` візьме першу зі списку `GET /v1/models`.
export const DEFAULT_MODEL = 'gemma-4-e4b-it-OptiQ-4bit'

// One-shot probe: GET {proxy origin}/health (myllm — Tauri app що форвардить
// /v1/* на реальний omlx і логує історію запитів) з коротким timeout. 2xx →
// проксі (і omlx позаду нього) живий; будь-що інше (timeout, refused, 502)
// → прямий URL.
// @returns {Promise<string>}
/**
 *
 */
async function probeOmlxBase() {
  try {
    const healthUrl = new URL('/health', PROXY_OMLX_BASE_URL).href
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(PROBE_TIMEOUT_MS) : undefined
    const response = await fetch(healthUrl, { signal })
    return response.ok ? PROXY_OMLX_BASE_URL : OMLX_BASE_URL
  } catch {
    return OMLX_BASE_URL
  }
}

// Кешує ПРОМІС (не значення) — кілька одночасних викликів loadEnv() не
// плодять паралельних /health-запитів.
let cachedProbe = null

// Ефективний base: явний аргумент виграє (тести, кастомні виклики); без
// нього — кешований probe myllm-проксі (:8088), інакше прямий :8000.
// @param {string} [base]
// @returns {Promise<string>}
/**
 *
 */
async function resolveBase(base) {
  if (base) return base
  if (!cachedProbe || Date.now() >= cachedProbe.expiresAt) {
    cachedProbe = { promise: probeOmlxBase(), expiresAt: Date.now() + PROBE_TTL_MS }
  }
  return cachedProbe.promise
}

// Ріже текст на чанки не довші за maxChars, по межах абзаців (порожній
// рядок), потім рядків; задовгий рядок — жорстко по символах. Чиста функція.
//
// @param {string} text
// @param {number} maxChars
// @returns {string[]} непорожні чанки
/**
 *
 */
export function chunkText(text, maxChars = 3500) {
  const normalized = String(text ?? '').trim()
  if (!normalized) return []

  const units = []
  for (const paragraph of normalized.split(/\n{2,}/)) {
    if (paragraph.length <= maxChars) {
      if (paragraph.trim()) units.push(paragraph)
      continue
    }
    let buf = ''
    for (const line of paragraph.split('\n')) {
      if (line.length > maxChars) {
        if (buf) {
          units.push(buf)
          buf = ''
        }
        for (let i = 0; i < line.length; i += maxChars) units.push(line.slice(i, i + maxChars))
        continue
      }
      const candidate = buf ? `${buf}\n${line}` : line
      if (candidate.length > maxChars && buf) {
        units.push(buf)
        buf = line
      } else {
        buf = candidate
      }
    }
    if (buf) units.push(buf)
  }

  const chunks = []
  let cur = ''
  for (const unit of units) {
    const candidate = cur ? `${cur}\n\n${unit}` : unit
    if (candidate.length > maxChars && cur) {
      chunks.push(cur)
      cur = unit
    } else {
      cur = candidate
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

// Будує chat-повідомлення для перекладу одного чанка. Чиста функція.
// @param {string} chunk
// @returns {Array<{role: string, content: string}>}
/**
 *
 */
export function buildMessages(chunk) {
  return [
    {
      role: 'system',
      content:
        'You are a professional EN→UK subtitle translator. Translate the user text into natural, fluent Ukrainian. ' +
        'Output ONLY the Ukrainian translation, preserving line breaks. Do not add notes, comments, transliteration or the original text.'
    },
    { role: 'user', content: chunk }
  ]
}

// Дістає текст відповіді з JSON OpenAI-compatible /v1/chat/completions.
// Чиста функція.
// @param {unknown} json
// @returns {string}
/**
 *
 */
export function extractContent(json) {
  const content = json?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

// Список завантажених моделей omlx (GET /v1/models).
// @returns {Promise<string[]>}
/**
 *
 */
export async function listOmlxModels(base, signal) {
  const resolvedBase = await resolveBase(base)
  const response = await fetch(`${resolvedBase}/models`, { method: 'GET', signal })
  if (!response.ok) throw new Error(`omlx HTTP ${response.status}`)
  const json = await response.json()
  return Array.isArray(json?.data) ? json.data.map(m => m?.id).filter(id => typeof id === 'string') : []
}

// Обирає модель: preferred, якщо завантажена; інакше першу наявну.
// @returns {Promise<string>}
/**
 *
 */
export async function resolveModel(base, preferred = DEFAULT_MODEL, signal) {
  const resolvedBase = await resolveBase(base)
  const models = await listOmlxModels(resolvedBase, signal)
  if (!models.length) throw new Error('omlx: немає завантажених моделей')
  return models.includes(preferred) ? preferred : models[0]
}

// Перекладає один чанк (POST /v1/chat/completions, OpenAI-compatible).
// @param {string} chunk
// @returns {Promise<string>} переклад
/**
 *
 */
export async function translateChunk(chunk, { model = DEFAULT_MODEL, base, apiKey, signal } = {}) {
  const resolvedBase = await resolveBase(base)
  const response = await fetch(`${resolvedBase}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { Authorization: `Bearer ${apiKey}` })
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(chunk),
      temperature: 0.2,
      stream: false
    })
  })
  if (!response.ok) throw new Error(`omlx HTTP ${response.status}`)
  const json = await response.json()
  return extractContent(json).trim()
}

// Перекладає весь текст українською. Розбиває на чанки, перекладає
// послідовно, повертає пари «оригінал ↔ переклад» для порівняння.
// onProgress(done, total) викликається після кожного чанка.
//
// @param {string} text
// @param {{model?: string, base?: string, apiKey?: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal}} opts
// @returns {Promise<{model: string, segments: Array<{original: string, translated: string}>, text: string}>}
/**
 *
 */
export async function translateToUkrainian(text, { model, base, apiKey, onProgress, signal } = {}) {
  // Резолвимо base один раз нагорі: довгий переклад не повинен фліпати ціль
  // посеред роботи, коли TTL probe-кешу спливе.
  const resolvedBase = await resolveBase(base)
  const chosenModel = model ?? (await resolveModel(resolvedBase, DEFAULT_MODEL, signal))
  const chunks = chunkText(text)
  const segments = []
  for (let i = 0; i < chunks.length; i++) {
    const translated = await translateChunk(chunks[i], { model: chosenModel, base: resolvedBase, apiKey, signal })
    segments.push({ original: chunks[i], translated })
    onProgress?.(i + 1, chunks.length)
  }
  return { model: chosenModel, segments, text: segments.map(s => s.translated).join('\n\n') }
}
