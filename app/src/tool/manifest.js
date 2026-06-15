import { TOOLS } from './catalog.js'

// Артефакти для споживачів, похідні від єдиного каталогу. LLM-адаптери (omlx на
// desktop, LiteRT-LM на Android) споживають OpenAI function-calling форму.

/**
 * Convert a tool input spec into a JSON Schema object.
 * @param {Record<string, {type: string, required?: boolean, description?: string}>} input tool input spec
 * @returns {object} JSON Schema for the parameters object
 */
function toJsonSchema(input) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(input)) {
    properties[key] = spec.description ? { type: spec.type, description: spec.description } : { type: spec.type }
    if (spec.required) required.push(key)
  }
  return required.length ? { type: 'object', properties, required } : { type: 'object', properties }
}

/**
 * OpenAI function-calling tool definitions, optionally filtered (e.g. by scope).
 * @param {(tool: object) => boolean} [allow] predicate; default includes all tools
 * @returns {object[]} OpenAI `tools` array
 */
export function toolManifest(allow = () => true) {
  return TOOLS.filter(tool => allow(tool)).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.summary,
      parameters: toJsonSchema(tool.input),
    },
  }))
}

/**
 * Compact catalog listing (name + summary).
 * @returns {{name: string, summary: string}[]} tool list
 */
export function listTools() {
  return TOOLS.map(({ name, summary }) => ({ name, summary }))
}
