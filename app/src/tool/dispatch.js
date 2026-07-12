import { getTool } from './catalog.js'

// dispatch(name, input, ctx): валідуємо вхід проти схеми tool'а, запускаємо
// його через transport і повертаємо уніфікований конверт. Transport — єдине, що
// можна підмінити (за замовчуванням кличе tool.run; тести/обгортки інжектують
// своє), тож контракт {ok, output|error} лишається однаковим для UI й LLM. ctx
// — не-схемні афорданси in-app виклику (onProgress, signal); LLM його не дає.

// Дефолтний transport: локальний виклик хендлера tool'а в цьому ж рантаймі.
const localTransport = (tool, input, ctx) => tool.run(input, ctx)

/**
 * Validate an input object against a tool's schema and optional custom validator.
 * @param {object} tool tool definition
 * @param {object} [input] candidate input
 * @returns {string|null} error message, or null when valid
 */
export function validateInput(tool, input) {
  const data = input ?? {}
  for (const [key, spec] of Object.entries(tool.input)) {
    const value = data[key]
    if (value === undefined || value === null) {
      if (spec.required) return `Missing required field: ${key}`
      continue
    }
    if (spec.type === 'string' && typeof value !== 'string') return `Field "${key}" must be a string`
    if (spec.type === 'array' && !Array.isArray(value)) return `Field "${key}" must be an array`
    if (spec.type === 'object' && (typeof value !== 'object' || Array.isArray(value)))
      return `Field "${key}" must be an object`
  }
  return tool.validate ? tool.validate(data) : null
}

/**
 * Build a dispatch function bound to a transport.
 * @param {(tool: object, input: object, ctx: object) => unknown} [transport] runs the tool's backend call
 * @returns {(name: string, input?: object, ctx?: object) => Promise<object>} dispatch returning an envelope
 */
export function createDispatch(transport = localTransport) {
  return async function dispatch(name, input, ctx = {}) {
    const tool = getTool(name)
    if (!tool) return { ok: false, error: { code: 'not_found', message: `Unknown tool: ${name}` } }

    const invalid = validateInput(tool, input)
    if (invalid) return { ok: false, error: { code: 'validation', message: invalid } }

    try {
      const output = await transport(tool, input ?? {}, ctx)
      return { ok: true, output }
    } catch (error) {
      return { ok: false, error: { code: 'io', message: String(error?.message ?? error) } }
    }
  }
}

// Готовий локальний dispatcher для in-app споживачів (UI, агент).
export const dispatch = createDispatch()
