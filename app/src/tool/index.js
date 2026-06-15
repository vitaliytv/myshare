// Public surface of the myshare tool layer (n-tool-surface). UI and the LLM
// agent import from here; the catalog stays the single place a tool is declared.
export { TOOLS, getTool } from './catalog.js'
export { dispatch, createDispatch, validateInput } from './dispatch.js'
export { toolManifest, listTools } from './manifest.js'
export { allowsTier, scopedManifest, guardDispatch } from './scope.js'
export { runAgent, createSystemPrompt, createOpenAiChat, createLiteRtChat, selectChat } from './llm.js'
