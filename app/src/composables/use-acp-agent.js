import { CODEX_ACP_AGENT_PRESET } from '@7n/tauri-components'
import { useAcpAgent as useAcpAgentBase } from '@7n/tauri-components/vue'
import { homeDir } from '@tauri-apps/api/path'
import { TOOLS } from '../tool/index.js'

// In-app ACP agent gateway for myshare — replaces the removed omlx/runAgent
// useAgent() (see CHANGELOG @7n/tauri-components@0.11.0). The shared engine +
// UI + journal + domain MCP bridge come from @7n/tauri-components; here we
// only inject the domain catalog, the agent/model presets, and a transport.
//
// No real "project"/filesystem concept for this app — links live in OPFS,
// subtitles/transcripts go through tauri-http (see youtube.js/page-meta.js)
// — so cwd is just a sane default for the spawned agent CLIs, not a
// meaningful workspace root. Falls back to "." outside a real Tauri runtime
// (e.g. browser dev preview) so an unavailable home dir can't crash the
// whole module graph via an unhandled top-level await rejection.
let cwd
try {
  cwd = await homeDir()
} catch {
  cwd = '.'
}

// myshare tools are plain JS handlers (tool.run), not Tauri commands — same
// reason the old useAgent() used this transport instead of the package's
// default tauriTransport.
const runTransport = (tool, input) => tool.run(input)

/**
 * @returns {object} the in-app ACP agent gateway (agentKind/modelTier refs, journal, loadEnv/request/respond/approve)
 */
export function useAcpAgent() {
  return useAcpAgentBase({
    catalog: TOOLS,
    cwd,
    transport: runTransport,
    agents: {
      codex: CODEX_ACP_AGENT_PRESET,
      cursor: {
        command: 'cursor',
        args: ['agent', 'acp'],
        tiers: {
          MIN: { label: 'GPT-5 Mini', args: ['--model', 'gpt-5-mini'] },
          AVG: { label: 'Grok 4.5', args: ['--model', 'cursor-grok-4.5-high'] },
          MAX: { label: 'Auto', args: ['--model', 'auto'] }
        }
      },
      pi: {
        // pi-acp hardcodes its own spawn args (`pi --mode rpc --no-themes`) and
        // has no model/provider passthrough — model comes from pi's own
        // ~/.pi/agent/settings.json, so no per-tier override is possible here.
        command: 'npx',
        args: ['-y', 'pi-acp']
      }
    }
  })
}
