// OPFS-backed sync-session config: relay URL, the Ory Hydra issuer/client this
// install logs into, and the current OAuth2 tokens. Separate from device-id.js —
// logging out clears the session but must not change the device's own identity.

import { opfsRoot } from '../opfs.js'

const FILE = 'session.json'

let memory = null

/**
 * @returns {Promise<{relayUrl: string, oryIssuer: string, clientId: string, accessToken: string, refreshToken: string, idToken: string, expiresAt: number}|null>} the persisted session, or null if logged out
 */
export async function loadSession() {
  const root = await opfsRoot()
  if (!root) return memory

  try {
    const handle = await root.getFileHandle(FILE)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * @param {object} session the sync session to persist (relay/Ory config + tokens)
 * @returns {Promise<void>}
 */
export async function saveSession(session) {
  const root = await opfsRoot()
  if (!root) {
    memory = session
    return
  }
  const handle = await root.getFileHandle(FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(session))
  await writable.close()
}

/**
 * @returns {Promise<void>}
 */
export async function clearSession() {
  const root = await opfsRoot()
  if (!root) {
    memory = null
    return
  }
  const handle = await root.getFileHandle(FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(null))
  await writable.close()
}

/**
 * Test seam: reset the in-memory fallback between tests.
 */
export function _resetForTest() {
  memory = null
}
