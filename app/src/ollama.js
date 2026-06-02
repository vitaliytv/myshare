// Переклад EN→UK субтитрів через локальний Ollama (тільки desktop/Mac).
// HTTP іде через tauri-plugin-http (як у page-meta.js) — Ollama слухає
// http://localhost:11434, тож звертаємось напряму, без окремої Rust-команди.
//
// Транскрипт може бути великим, тож ріжемо його на чанки і перекладаємо
// послідовно, зберігаючи пари «оригінал ↔ переклад» (segments) для зручного
// порівняння. Результат кешується викликачем (translation-cache.js), щоб не
// перекладати те саме відео двічі.

import { fetch } from '@tauri-apps/plugin-http'

export const OLLAMA_BASE = 'http://localhost:11434'
// Модель за замовчуванням. Якщо її нема серед завантажених — `resolveModel`
// візьме першу наявну. Змінити дефолт = правка цієї константи.
export const DEFAULT_MODEL = 'gemma4:e4b'

// Ріже текст на чанки не довші за maxChars, по межах абзаців (порожній рядок),
// потім рядків; задовгий рядок — жорстко по символах. Чиста функція.
//
// @param {string} text
// @param {number} maxChars
// @returns {string[]} непорожні чанки
export function chunkText(text, maxChars = 3500) {
  const normalized = String(text ?? '').trim()
  if (!normalized) return []

  // 1) Розбиваємо на одиниці (абзаци), задовгі абзаци — на рядки/слайси.
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

  // 2) Зливаємо одиниці в чанки <= maxChars (з'єднуючи порожнім рядком).
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

// Дістає текст відповіді з JSON Ollama /api/chat. Чиста функція.
// @param {unknown} json
// @returns {string}
export function extractContent(json) {
  const content = json?.message?.content
  return typeof content === 'string' ? content : ''
}

// Список завантажених моделей Ollama (GET /api/tags).
// @returns {Promise<string[]>}
export async function listOllamaModels(base = OLLAMA_BASE, signal) {
  const response = await fetch(`${base}/api/tags`, { method: 'GET', signal })
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
  const json = await response.json()
  return Array.isArray(json?.models)
    ? json.models.map((m) => m?.name).filter((n) => typeof n === 'string')
    : []
}

// Обирає модель: preferred, якщо завантажена; інакше першу наявну.
// @returns {Promise<string>}
export async function resolveModel(base = OLLAMA_BASE, preferred = DEFAULT_MODEL, signal) {
  const models = await listOllamaModels(base, signal)
  if (!models.length) throw new Error('Ollama: немає завантажених моделей (ollama pull <model>)')
  return models.includes(preferred) ? preferred : models[0]
}

// Перекладає один чанк (POST /api/chat, stream:false, низька температура).
// @param {string} chunk
// @returns {Promise<string>} переклад
export async function translateChunk(chunk, { model = DEFAULT_MODEL, base = OLLAMA_BASE, signal } = {}) {
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.2 },
      messages: buildMessages(chunk)
    })
  })
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
  const json = await response.json()
  return extractContent(json).trim()
}

// Перекладає весь текст українською. Розбиває на чанки, перекладає послідовно,
// повертає пари «оригінал ↔ переклад» для порівняння + зведений текст.
// onProgress(done, total) викликається після кожного чанка.
//
// @param {string} text
// @param {{model?: string, base?: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal}} opts
// @returns {Promise<{model: string, segments: Array<{original: string, translated: string}>, text: string}>}
export async function translateToUkrainian(text, { model, base = OLLAMA_BASE, onProgress, signal } = {}) {
  const chosenModel = model ?? (await resolveModel(base, DEFAULT_MODEL, signal))
  const chunks = chunkText(text)
  const segments = []
  for (let i = 0; i < chunks.length; i++) {
    const translated = await translateChunk(chunks[i], { model: chosenModel, base, signal })
    segments.push({ original: chunks[i], translated })
    onProgress?.(i + 1, chunks.length)
  }
  return { model: chosenModel, segments, text: segments.map((s) => s.translated).join('\n\n') }
}
