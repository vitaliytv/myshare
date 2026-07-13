// Stable per-install device id, used by the relay journal for echo-suppression
// (a device doesn't need its own pushes broadcast back to itself) and for
// eyeballing "which device wrote this" in the relay's sqlite during debugging.
// Persisted in OPFS so it survives reloads but stays unique per app install.

import { opfsRoot } from '../opfs.js'

const FILE = 'device.json'

let cached = null

/**
 * @returns {Promise<string>} this install's stable device id, generating one on first call
 */
export async function getDeviceId() {
  if (cached) return cached

  const root = await opfsRoot()
  if (!root) {
    cached = crypto.randomUUID()
    return cached
  }

  try {
    const handle = await root.getFileHandle(FILE)
    const file = await handle.getFile()
    const parsed = JSON.parse(await file.text())
    if (typeof parsed.deviceId === 'string' && parsed.deviceId) {
      cached = parsed.deviceId
      return cached
    }
  } catch {
    // missing/unreadable file → fall through and generate one
  }

  cached = crypto.randomUUID()
  const handle = await root.getFileHandle(FILE, { create: true })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify({ deviceId: cached }))
  await writable.close()
  return cached
}

/**
 * Test seam: forget the cached id so the next getDeviceId() call re-derives it.
 */
export function _resetForTest() {
  cached = null
}
