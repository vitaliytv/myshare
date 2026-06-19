// Public surface of the myshare tool layer (n-tool-surface). The UI imports the
// local, ctx-aware dispatch from here (translate needs onProgress/signal, which
// the package dispatch doesn't carry). The agent's loop, manifest, scope,
// journal and chat now come from @7n/tauri-components (see composables/use-agent.js).
// The catalog stays the single place a tool is declared.
export { TOOLS, getTool } from './catalog.js'
export { dispatch, createDispatch, validateInput } from './dispatch.js'
