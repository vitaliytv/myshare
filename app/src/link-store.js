// OPFS-backed store for the user's shared links. Persists a JSON array in the
// origin-private file system (survives reloads, larger quota than localStorage,
// not readable by other origins). Both the UI and the agent's add_link/list_links
// tools go through here, so they share one source of truth.
//
// When OPFS is unavailable (component tests, older webviews) it falls back to an
// in-memory list so callers still work — they just don't persist.

const FILE = 'links.json'

// In-memory fallback when OPFS is absent (keeps add/list coherent within a run).
let memory = []

/**
 * @returns {Promise<FileSystemDirectoryHandle|null>} the OPFS root, or null when unavailable
 */
async function opfsRoot() {
  try {
    const storage = globalThis.navigator?.storage
    return storage?.getDirectory ? await storage.getDirectory() : null
  } catch {
    return null
  }
}

/**
 * @returns {Promise<string[]>} the persisted link list (newest first), or [] on any error
 */
async function readLinks() {
  const root = await opfsRoot()
  if (!root) return [...memory]
  try {
    const handle = await root.getFileHandle(FILE)
    const text = await (await handle.getFile()).text()
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string' && u) : []
  } catch {
    return [] // missing file or unreadable → empty
  }
}

/**
 * Overwrite the persisted list.
 * @param {string[]} list links to store
 * @returns {Promise<void>}
 */
async function writeLinks(list) {
  const root = await opfsRoot()
  if (!root) {
    memory = [...list]
    return
  }
  const handle = await root.getFileHandle(FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(list))
  await writable.close()
}

/**
 * List the saved links, newest first.
 * @returns {Promise<string[]>} saved links
 */
export async function listLinks() {
  return readLinks()
}

/**
 * Prepend a URL to the list (deduplicated). No-op for empty/non-string input.
 * @param {string} url absolute URL to save
 * @returns {Promise<string[]>} the updated list
 */
export async function addLink(url) {
  if (typeof url !== 'string' || url.length === 0) return readLinks()
  const list = await readLinks()
  if (list.includes(url)) return list
  const next = [url, ...list]
  await writeLinks(next)
  return next
}

/**
 * Test seam: reset the in-memory fallback between tests.
 */
export function _resetForTest() {
  memory = []
}
