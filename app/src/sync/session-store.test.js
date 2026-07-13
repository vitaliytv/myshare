import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTest, clearSession, loadSession, saveSession } from './session-store.js'

describe('session-store (in-memory fallback, no OPFS in happy-dom)', () => {
  beforeEach(() => {
    _resetForTest()
  })

  it('starts with no session', async () => {
    expect(await loadSession()).toBeNull()
  })

  it('round-trips a saved session', async () => {
    const session = { relayUrl: 'https://relay.example', accessToken: 'a', expiresAt: 123 }
    await saveSession(session)
    expect(await loadSession()).toEqual(session)
  })

  it('clearSession wipes the session', async () => {
    await saveSession({ relayUrl: 'https://relay.example' })
    await clearSession()
    expect(await loadSession()).toBeNull()
  })
})
