// OPFS-backed store for the user's shared links. Persists `{version, linksSeq, items}`
// in the origin-private file system (survives reloads, larger quota than localStorage,
// not readable by other origins). Both the UI and the agent's add_link/list_links tools
// go through here, so they share one source of truth. `items` carry ids/timestamps/tombstones
// so the sync layer (app/src/sync/client.js) can merge them against a relay journal.
//
// When OPFS is unavailable (component tests, older webviews) it falls back to an
// in-memory list so callers still work — they just don't persist.

import { opfsRoot } from './opfs.js'

const FILE = 'links.json'
const CURRENT_VERSION = 2

/** @type {{version: number, linksSeq: number, items: Array<{id: string, url: string, createdAt: number, deleted: boolean}>}} */
let memory = { version: CURRENT_VERSION, linksSeq: 0, items: [] }

/**
 * @returns {{version: number, linksSeq: number, items: Array}} a fresh, empty store state
 */
function emptyState() {
  return { version: CURRENT_VERSION, linksSeq: 0, items: [] }
}

/**
 * Migrate the pre-sync flat `string[]` shape (newest-first) into `items`, synthesizing
 * ids and descending createdAt values so `listLinks()` ordering is preserved.
 * @param {string[]} urls the old on-disk shape (flat array of URL strings)
 * @returns {{version: number, linksSeq: number, items: Array}} the migrated store state
 */
function migrateFlatArray(urls) {
  const now = Date.now()
  return {
    version: CURRENT_VERSION,
    linksSeq: 0,
    items: urls
      .filter(u => typeof u === 'string' && u)
      .map((url, index) => ({ id: crypto.randomUUID(), url, createdAt: now - index, deleted: false }))
  }
}

/**
 * @returns {Promise<{version: number, linksSeq: number, items: Array}>} the current store state
 */
async function readState() {
  const root = await opfsRoot()
  if (!root) return memory

  let parsed
  try {
    const handle = await root.getFileHandle(FILE)
    const file = await handle.getFile()
    parsed = JSON.parse(await file.text())
  } catch {
    return emptyState() // missing file or unreadable → empty
  }

  if (Array.isArray(parsed)) {
    const migrated = migrateFlatArray(parsed)
    await writeState(migrated)
    return migrated
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
    return {
      version: CURRENT_VERSION,
      linksSeq: typeof parsed.linksSeq === 'number' ? parsed.linksSeq : 0,
      items: parsed.items.filter(
        i => i && typeof i.id === 'string' && typeof i.url === 'string' && typeof i.createdAt === 'number'
      )
    }
  }

  return emptyState()
}

/**
 * @param {{version: number, linksSeq: number, items: Array}} state the full store state to persist
 * @returns {Promise<void>}
 */
async function writeState(state) {
  const root = await opfsRoot()
  if (!root) {
    memory = state
    return
  }
  const handle = await root.getFileHandle(FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(state))
  await writable.close()
}

/**
 * @param {{version: number, linksSeq: number, items: Array}} state the full store state
 * @returns {Array<{id: string, url: string, createdAt: number, deleted: boolean}>} non-deleted items, newest first
 */
function sortedRecords(state) {
  // Tie-break equal createdAt (sub-millisecond adds) by insertion order, newest-added first —
  // otherwise Array#sort's stability would keep same-timestamp items in original (oldest-first) order.
  return state.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.deleted)
    .toSorted((a, b) => b.item.createdAt - a.item.createdAt || b.index - a.index)
    .map(({ item }) => item)
}

/**
 * List the saved links, newest first.
 * @returns {Promise<string[]>} saved links
 */
export async function listLinks() {
  const state = await readState()
  return sortedRecords(state).map(i => i.url)
}

/**
 * Full records (id/url/createdAt), non-deleted, newest first — used by the sync layer.
 * @returns {Promise<Array<{id: string, url: string, createdAt: number, deleted: boolean}>>} full non-deleted records, newest first
 */
export async function listLinkRecords() {
  const state = await readState()
  return sortedRecords(state)
}

/**
 * Prepend a URL to the list (deduplicated). No-op for empty/non-string input.
 * @param {string} url absolute URL to save
 * @returns {Promise<string[]>} the updated list
 */
export async function addLink(url) {
  if (typeof url !== 'string' || url.length === 0) return listLinks()
  const state = await readState()
  if (state.items.some(i => !i.deleted && i.url === url)) return sortedRecords(state).map(i => i.url)

  state.items.push({ id: crypto.randomUUID(), url, createdAt: Date.now(), deleted: false })
  await writeState(state)
  return sortedRecords(state).map(i => i.url)
}

/**
 * Tombstone the (first non-deleted) item matching `url`. No-op if not found.
 * @param {string} url the URL to remove
 * @returns {Promise<string[]>} the updated list
 */
export async function removeLink(url) {
  const state = await readState()
  const item = state.items.find(i => !i.deleted && i.url === url)
  if (!item) return sortedRecords(state).map(i => i.url)

  item.deleted = true
  await writeState(state)
  return sortedRecords(state).map(i => i.url)
}

/**
 * Idempotent upsert-by-id used by the sync client to fold in server-pushed rows.
 * Must not be routed back through addLink/removeLink (would re-enqueue an outbound push).
 * @param {{id: string, url: string|null, deleted: boolean, createdAt?: number, seq?: number}} mutation a relay journal row
 * @returns {Promise<void>}
 */
export async function _applyRemoteLinkMutation({ id, url, deleted, createdAt, seq }) {
  const state = await readState()
  const existing = state.items.find(i => i.id === id)
  if (existing) {
    existing.deleted = Boolean(deleted)
    if (!deleted && typeof url === 'string') existing.url = url
  } else {
    state.items.push({
      id,
      url: typeof url === 'string' ? url : '',
      createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
      deleted: Boolean(deleted)
    })
  }
  if (typeof seq === 'number' && seq > state.linksSeq) state.linksSeq = seq
  await writeState(state)
}

/**
 * @returns {Promise<number>} the last relay seq folded into this store
 */
export async function _lastSyncedSeq() {
  const state = await readState()
  return state.linksSeq
}

/**
 * @param {number} seq the relay seq to record as synced
 * @returns {Promise<void>}
 */
export async function _setLastSyncedSeq(seq) {
  const state = await readState()
  state.linksSeq = seq
  await writeState(state)
}

/**
 * Test seam: reset the in-memory fallback between tests.
 */
export function _resetForTest() {
  memory = emptyState()
}
