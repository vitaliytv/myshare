import { getTool } from './catalog.js'
import { toolManifest } from './manifest.js'

// Trust tiers (n-tool-surface): read < write < destructive. Актор обмежує, які
// tool'и взагалі видно моделі (scopedManifest) і які дозволено виконати
// (guardDispatch). Зараз destructive-tool'ів нема, але сім тримаємо — нова
// руйнівна дія автоматично стане human-only без правок у споживачах.

const TIER_RANK = { read: 0, write: 1, destructive: 2 }

// Стеля довіри за типом актора. Людина може все; агент — до write включно
// (translate безпечний). Невідомий актор → лише read.
const ACTOR_MAX_TIER = { human: 'destructive', agent: 'write' }

/**
 * Whether an actor may invoke a tool of the given tier.
 * @param {{ kind?: string }} actor actor descriptor
 * @param {string} tier tool tier
 * @returns {boolean} true when the actor's max tier covers the tool's tier
 */
export function allowsTier(actor, tier) {
  const max = ACTOR_MAX_TIER[actor?.kind] ?? 'read'
  return (TIER_RANK[tier] ?? Number.POSITIVE_INFINITY) <= TIER_RANK[max]
}

/**
 * OpenAI tool manifest restricted to what the actor may call.
 * @param {{ kind?: string }} actor actor descriptor
 * @returns {object[]} scoped OpenAI `tools` array
 */
export function scopedManifest(actor) {
  return toolManifest(tool => allowsTier(actor, tool.tier))
}

/**
 * Wrap a dispatch so out-of-scope tools return a forbidden envelope instead of running.
 * @param {(name: string, input?: object) => Promise<object>} dispatch base dispatcher
 * @param {{ kind?: string }} actor actor descriptor
 * @returns {(name: string, input?: object) => Promise<object>} guarded dispatcher
 */
export function guardDispatch(dispatch, actor) {
  return function guarded(name, input) {
    const tool = getTool(name)
    if (tool && !allowsTier(actor, tool.tier)) {
      return { ok: false, error: { code: 'forbidden', message: `Tool "${name}" (${tool.tier}) is out of scope for this actor.` } }
    }
    // Unknown tool / validation лишаємо базовому dispatch.
    return dispatch(name, input)
  }
}
