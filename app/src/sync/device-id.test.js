import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTest, getDeviceId } from './device-id.js'

const UUID_RE = /^[0-9a-f-]{36}$/

describe('device-id (in-memory fallback, no OPFS in happy-dom)', () => {
  beforeEach(() => {
    _resetForTest()
  })

  it('generates a uuid on first call', async () => {
    const id = await getDeviceId()
    expect(id).toMatch(UUID_RE)
  })

  it('returns the same id on repeated calls within a session', async () => {
    const a = await getDeviceId()
    const b = await getDeviceId()
    expect(a).toBe(b)
  })

  it('generates a fresh id after _resetForTest (no OPFS to persist against)', async () => {
    const a = await getDeviceId()
    _resetForTest()
    const b = await getDeviceId()
    expect(a).not.toBe(b)
  })
})
