import { extractYoutubeVideoId, getYoutubeTranscript, getYoutubeLanguages } from '../youtube.js'
import { fetchPageMeta } from '../page-meta.js'
import { translateToUkrainian } from '../omlx.js'
import { addLink, listLinks } from '../link-store.js'

// Єдине джерело правди для headless tool-surface (n-tool-surface).
// Кожен tool — іменований виклик зі схемою, до якого однаково дотягуються UI
// і LLM-агент через `dispatch`. На відміну від task-app, у myshare один рантайм
// (WebView), без окремого CLI-процесу, тож транспорт не різниться per-consumer:
// кожен tool несе власний `run(input)`, який делегує в наявні модулі
// (youtube.js / page-meta.js / omlx.js) — ті самі функції, що кличе й UI. Так
// логіка лишається в одному місці, а каталог лише додає схему й LLM-досяжність.
//
// `tier` — рівень довіри (read < write < destructive); scope.js фільтрує
// маніфест і охороняє dispatch за актором (human/agent).

export const TOOLS = [
  {
    tier: 'read',
    name: 'youtube_id',
    summary: 'Extract the 11-char YouTube video id from a URL. Returns empty when the URL is not a recognizable YouTube link.',
    input: {
      url: { type: 'string', required: true, description: 'A YouTube watch/shorts/embed/youtu.be URL.' },
    },
    run: input => ({ videoId: extractYoutubeVideoId(input.url) }),
  },
  {
    tier: 'read',
    name: 'languages',
    summary: 'List subtitle language codes available for a YouTube video (one supadata call, no transcript text).',
    input: {
      videoId: { type: 'string', required: true, description: '11-char YouTube video id (use the youtube_id tool to get it).' },
    },
    run: input => getYoutubeLanguages(input.videoId),
  },
  {
    tier: 'read',
    name: 'transcript',
    summary: 'Fetch a YouTube transcript as plain text. Tries preferred languages in order; the first available wins.',
    input: {
      videoId: { type: 'string', required: true, description: '11-char YouTube video id.' },
      preferred: { type: 'array', required: false, description: 'Language codes in priority order, e.g. ["uk","en"]. Defaults to ["uk","en"].' },
    },
    run: input => getYoutubeTranscript(input.videoId, input.preferred ?? ['uk', 'en']),
  },
  {
    tier: 'read',
    name: 'page_meta',
    summary: 'Fetch a web page and return its { title, favicon } (HTTP via tauri-plugin-http, no CORS).',
    input: {
      url: { type: 'string', required: true, description: 'Absolute http(s) URL of the page.' },
    },
    run: input => fetchPageMeta(input.url),
  },
  {
    tier: 'write',
    name: 'translate',
    summary: 'Translate English text into Ukrainian via the local LLM. Returns { model, text, segments } with aligned original↔translation pairs.',
    input: {
      text: { type: 'string', required: true, description: 'Source text in English.' },
      model: { type: 'string', required: false, description: 'Preferred model id; falls back to the first loaded model.' },
    },
    // ctx несе UI-афорданси поза JSON-схемою (onProgress, signal) — LLM-шлях їх
    // не передає, маніфест їх не бачить.
    run: (input, ctx = {}) => translateToUkrainian(input.text, { model: input.model, onProgress: ctx.onProgress, signal: ctx.signal }),
  },
  {
    tier: 'read',
    name: 'list_links',
    summary: 'List the URLs the user has saved/shared (newest first).',
    input: {},
    run: () => listLinks(),
  },
  {
    tier: 'write',
    name: 'add_link',
    summary: 'Save a new URL to the shared-links list. Returns the updated list (newest first).',
    input: {
      url: { type: 'string', required: true, description: 'Absolute http(s) URL to save.' },
    },
    run: input => addLink(input.url),
  },
]

/**
 * Look up a tool by name.
 * @param {string} name tool name
 * @returns {object|null} the tool definition, or null if unknown
 */
export function getTool(name) {
  return TOOLS.find(tool => tool.name === name) ?? null
}
