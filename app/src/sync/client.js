// Sync engine: desktop keeps one persistent WebSocket to the relay (push+pull
// over the same socket, reconnect with backoff); Android has no persistent
// connection, so it pushes a mutation immediately over HTTP (queuing on
// failure) and pulls on foreground. Both apply incoming journal rows back into
// link-store.js/translation-cache.js via their idempotent _applyRemote*Mutation
// seams, then notify the UI via a CustomEvent (mirrors `myshare:android-share`).

import { opfsRoot } from '../opfs.js'
import { isAndroidPlatform } from '../platform.js'
import {
  _applyRemoteLinkMutation,
  _lastSyncedSeq as lastSyncedLinksSeq,
  _setLastSyncedSeq as setSyncedLinksSeq,
  listLinkRecords
} from '../link-store.js'
import {
  _applyRemoteTranslationMutation,
  _lastSyncedSeq as lastSyncedTranslationsSeq,
  _setLastSyncedSeq as setSyncedTranslationsSeq,
  loadTranslations
} from '../translation-cache.js'
import { refreshIfNeeded } from './auth.js'
import { getDeviceId } from './device-id.js'
import { loadSession } from './session-store.js'

export const SYNC_UPDATED_EVENT = 'myshare:sync-updated'

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30_000
const QUEUE_FILE = 'sync-queue.json'
const HTTP_SCHEME_RE = /^http/

let ws = null
let stopped = true
let reconnectDelay = RECONNECT_MIN_MS
let reconnectTimer = null

/**
 * Dispatch the UI-refresh event after remote mutations have been folded in.
 * @returns {void}
 */
function notifyUpdated() {
  if (globalThis.window !== undefined && typeof globalThis.dispatchEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(SYNC_UPDATED_EVENT))
  }
}

// In-memory fallback when OPFS is absent (component tests, older webviews) —
// without this, a queued push would silently vanish instead of surviving
// until the next flushQueue() call within the same run.
let queueMemory = []

/**
 * @returns {Promise<Array<{table: 'links'|'translations', item: object}>>} pending (not yet pushed) mutations
 */
async function readQueue() {
  const root = await opfsRoot()
  if (!root) return [...queueMemory]
  try {
    const handle = await root.getFileHandle(QUEUE_FILE)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * @param {Array<{table: 'links'|'translations', item: object}>} queue the full pending-push queue to persist
 * @returns {Promise<void>}
 */
async function writeQueue(queue) {
  const root = await opfsRoot()
  if (!root) {
    queueMemory = queue
    return
  }
  const handle = await root.getFileHandle(QUEUE_FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(queue))
  await writable.close()
}

/**
 * @param {{table: 'links'|'translations', item: object}} entry a mutation to retry later
 * @returns {Promise<void>}
 */
async function enqueue(entry) {
  const queue = await readQueue()
  queue.push(entry)
  await writeQueue(queue)
}

/**
 * Fold one relay journal row into the matching local store.
 * @param {'links'|'translations'} table which local store to update
 * @param {{id: string, value: unknown, deleted: boolean, createdAt?: number, seq?: number}} item the relay journal row
 * @returns {Promise<void>}
 */
async function applyIncoming(table, item) {
  if (table === 'links') {
    await _applyRemoteLinkMutation({
      id: item.id,
      url: item.value,
      deleted: item.deleted,
      createdAt: item.createdAt,
      seq: item.seq
    })
    return
  }
  const cache = loadTranslations(globalThis.localStorage)
  _applyRemoteTranslationMutation(globalThis.localStorage, cache, {
    videoId: item.id,
    entry: item.value,
    deleted: item.deleted
  })
  if (typeof item.seq === 'number') setSyncedTranslationsSeq(globalThis.localStorage, item.seq)
}

/**
 * @param {{relayUrl: string, accessToken: string}} session the active sync session
 * @param {'links'|'translations'} table which push endpoint to call
 * @param {{id: string, value: unknown, deleted: boolean, createdAt?: number}} item the mutation to push
 * @returns {Promise<void>}
 */
async function pushOverHttp(session, table, item) {
  const deviceId = await getDeviceId()
  const response = await fetch(`${session.relayUrl}/sync/${table}/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ items: [item], deviceId })
  })
  if (!response.ok) throw new Error(`push failed: ${response.status}`)
}

/**
 * Push one local mutation. Sends immediately over the live WS if desktop is
 * connected, otherwise over HTTP; queues (OPFS-backed) on any failure so it
 * survives an app restart and gets retried by flushQueue().
 * @param {'links'|'translations'} table which push endpoint to call
 * @param {{id: string, value: unknown, deleted: boolean, createdAt?: number}} item the mutation to push
 * @returns {Promise<void>}
 */
async function pushMutation(table, item) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'push', table, item }))
    return
  }

  const session = await refreshIfNeeded(await loadSession())
  if (!session) {
    await enqueue({ table, item })
    return
  }
  try {
    await pushOverHttp(session, table, item)
  } catch {
    await enqueue({ table, item })
  }
}

/**
 * @param {{id: string, url: string, createdAt: number, deleted: boolean}} record the link-store record to push
 * @returns {Promise<void>}
 */
export function pushLinkMutation(record) {
  return pushMutation('links', {
    id: record.id,
    value: record.url,
    deleted: record.deleted,
    createdAt: record.createdAt
  })
}

/**
 * @param {{videoId: string, entry: object|null, deleted: boolean}} mutation the translation-cache record to push
 * @returns {Promise<void>}
 */
export function pushTranslationMutation({ videoId, entry, deleted }) {
  return pushMutation('translations', { id: videoId, value: entry, deleted })
}

/**
 * Retry any queued pushes left over from a previous failed attempt or app kill.
 * @returns {Promise<void>}
 */
export async function flushQueue() {
  const queue = await readQueue()
  if (queue.length === 0) return

  const session = await refreshIfNeeded(await loadSession())
  if (!session) return

  const remaining = []
  for (const { table, item } of queue) {
    try {
      await pushOverHttp(session, table, item)
    } catch {
      remaining.push({ table, item })
    }
  }
  await writeQueue(remaining)
}

/**
 * @param {{relayUrl: string, accessToken: string}} session the active sync session
 * @param {'links'|'translations'} table which pull endpoint to call
 * @returns {Promise<void>}
 */
async function pullTable(session, table) {
  const since = table === 'links' ? await lastSyncedLinksSeq() : lastSyncedTranslationsSeq(globalThis.localStorage)
  const response = await fetch(`${session.relayUrl}/sync/${table}/pull?since=${since}`, {
    headers: { authorization: `Bearer ${session.accessToken}` }
  })
  if (!response.ok) return

  const { items, latestSeq } = await response.json()
  for (const item of items) await applyIncoming(table, item)
  if (table === 'links') await setSyncedLinksSeq(latestSeq)
  else setSyncedTranslationsSeq(globalThis.localStorage, latestSeq)
}

/**
 * One-shot HTTP sync round: flush queued pushes, then pull both tables. Meant
 * for Android (no persistent connection) — call at app start and on
 * `visibilitychange` becoming visible.
 * @returns {Promise<void>}
 */
export async function pullOnce() {
  const session = await refreshIfNeeded(await loadSession())
  if (!session) return
  await flushQueue()
  await pullTable(session, 'links')
  await pullTable(session, 'translations')
  notifyUpdated()
}

/**
 * One-time push of all pre-existing local data on a fresh account (empty
 * journal) — otherwise a user's existing links/translations would never
 * reach the relay, since steady-state sync only pushes new mutations.
 * @returns {Promise<void>}
 */
export async function bootstrapIfNeeded() {
  const session = await refreshIfNeeded(await loadSession())
  if (!session) return

  if ((await lastSyncedLinksSeq()) === 0) {
    for (const record of await listLinkRecords()) {
      await pushMutation('links', { id: record.id, value: record.url, deleted: false, createdAt: record.createdAt })
    }
  }

  if (lastSyncedTranslationsSeq(globalThis.localStorage) === 0) {
    const cache = loadTranslations(globalThis.localStorage)
    for (const [videoId, entry] of Object.entries(cache)) {
      if (!entry.deleted) await pushMutation('translations', { id: videoId, value: entry, deleted: false })
    }
  }
}

/**
 * @param {MessageEvent} event the WS message event
 * @returns {Promise<void>}
 */
async function handleWsMessage(event) {
  const msg = JSON.parse(event.data)
  switch (msg.type) {
    case 'catchup': {
      for (const item of msg.links) await applyIncoming('links', item)
      for (const item of msg.translations) await applyIncoming('translations', item)
      notifyUpdated()
      break
    }
    case 'push': {
      await applyIncoming(msg.table, msg.item)
      notifyUpdated()
      break
    }
    case 'push-ack': {
      if (msg.table === 'links') await setSyncedLinksSeq(msg.seq)
      else setSyncedTranslationsSeq(globalThis.localStorage, msg.seq)
      break
    }
    // No default
  }
}

/**
 * Open (or reopen) the desktop persistent WS connection to the relay.
 * @returns {Promise<void>}
 */
async function connect() {
  if (stopped) return

  const session = await refreshIfNeeded(await loadSession())
  if (!session) return

  const deviceId = await getDeviceId()
  const wsUrl = `${session.relayUrl.replace(HTTP_SCHEME_RE, 'ws')}/sync/ws`
  ws = new WebSocket(wsUrl)

  ws.addEventListener('open', async () => {
    reconnectDelay = RECONNECT_MIN_MS
    await flushQueue()
    ws.send(
      JSON.stringify({
        type: 'hello',
        token: session.accessToken,
        deviceId,
        linksSince: await lastSyncedLinksSeq(),
        translationsSince: lastSyncedTranslationsSeq(globalThis.localStorage)
      })
    )
  })

  ws.addEventListener('message', handleWsMessage)

  ws.addEventListener('close', () => {
    ws = null
    if (!stopped) scheduleReconnect()
  })
}

/**
 * @returns {void}
 */
function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
    connect()
  }, reconnectDelay)
}

/**
 * Start the desktop persistent-WS sync loop. No-op on Android (use pullOnce()
 * + pushLinkMutation/pushTranslationMutation instead — see platform.js).
 * @returns {Promise<void>}
 */
export async function startSync() {
  if (isAndroidPlatform()) return
  stopped = false
  await bootstrapIfNeeded()
  await connect()
}

/**
 * Stop the desktop sync loop (e.g. on logout).
 * @returns {void}
 */
export function stopSync() {
  stopped = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  ws?.close()
  ws = null
}

/**
 * Test seam: reset all module-level sync state.
 * @returns {void}
 */
export function _resetForTest() {
  stopped = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectDelay = RECONNECT_MIN_MS
  ws = null
  queueMemory = []
}
