import { useAgent as useAgentBase } from '@7n/tauri-components/vue'
import { TOOLS } from '../tool/index.js'
import { createSystemPrompt } from '../tool/prompt.js'

// In-app agent gateway for myshare. The shared engine + UI + journal come from
// @7n/tauri-components; here we only inject the domain catalog, the system prompt
// and a transport.
//
// myshare tools are plain JS handlers (tool.run), not Tauri commands — links live
// in OPFS, subtitles/transcripts go through tauri-http inside youtube.js — so we
// route the agent through a run-transport instead of the default Tauri invoke.

const runTransport = (tool, input) => tool.run(input)

/**
 * @returns {object} the in-app agent gateway (request/respond/approve + omlx config + journal)
 */
export function useAgent() {
  return useAgentBase({
    catalog: TOOLS,
    systemPrompt: createSystemPrompt(),
    transport: runTransport,
    omlx: { storagePrefix: 'myshare' },
  })
}
