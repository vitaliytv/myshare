import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
const refreshIfNeeded = vi.fn(session => session)
const isAndroidPlatform = vi.fn(() => false)

vi.mock('./session-store.js', () => ({ loadSession: (...args) => loadSession(...args) }))
vi.mock('./auth.js', () => ({ refreshIfNeeded: (...args) => refreshIfNeeded(...args) }))
vi.mock('../platform.js', () => ({ isAndroidPlatform: (...args) => isAndroidPlatform(...args) }))

const { _resetForTest, bootstrapIfNeeded, flushQueue, pullOnce, pushLinkMutation, pushTranslationMutation, startSync } =
  await import('./client.js')
const { _resetForTest: resetLinks, addLink, listLinks } = await import('../link-store.js')
const { _resetForTest: resetDeviceId } = await import('./device-id.js')

const SESSION = { relayUrl: 'https://relay.test', accessToken: 'at', refreshToken: 'rt' }

/**
 * @param {object} body the parsed JSON body to resolve `.json()` with
 * @param {boolean} [ok] whether the mocked response is `ok`
 * @returns {{ok: boolean, status: number, json: () => object}} a minimal fetch Response double
 */
function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => body }
}

// happy-dom's environment doesn't ship a working window.localStorage by default
// (client.js reads it directly, matching how App.vue already does); stand in
// with a minimal in-memory implementation, same shape the real webview provides.
/**
 * @returns {Storage} a minimal in-memory localStorage double
 */
function fakeLocalStorage() {
  const store = new Map()
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  }
}

beforeEach(() => {
  _resetForTest()
  resetLinks()
  resetDeviceId()
  loadSession.mockReset().mockResolvedValue(SESSION)
  refreshIfNeeded.mockReset().mockImplementation(session => session)
  isAndroidPlatform.mockReset().mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn())
  Object.defineProperty(globalThis, 'localStorage', { value: fakeLocalStorage(), writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pushLinkMutation (HTTP path — no live WS)', () => {
  it('POSTs the mutation with a bearer token and device id', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ seq: 1 }))
    await pushLinkMutation({ id: 'l1', url: 'https://a.test', createdAt: 1, deleted: false })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://relay.test/sync/links/push')
    expect(init.headers.authorization).toBe('Bearer at')
    const body = JSON.parse(init.body)
    expect(body.items).toEqual([{ id: 'l1', value: 'https://a.test', deleted: false, createdAt: 1 }])
  })

  it('queues the mutation when the push fails, and flushQueue retries it', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'))
    await pushLinkMutation({ id: 'l1', url: 'https://a.test', createdAt: 1, deleted: false })
    expect(fetch).toHaveBeenCalledTimes(1)

    fetch.mockResolvedValueOnce(jsonResponse({ seq: 1 }))
    await flushQueue()
    expect(fetch).toHaveBeenCalledTimes(2)

    // second flush with nothing queued shouldn't call fetch again
    await flushQueue()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('is a no-op with no session (queues instead of throwing)', async () => {
    loadSession.mockResolvedValue(null)
    refreshIfNeeded.mockResolvedValue(null)
    await expect(
      pushLinkMutation({ id: 'l1', url: 'https://a.test', createdAt: 1, deleted: false })
    ).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('pushTranslationMutation', () => {
  it('POSTs to the translations push endpoint', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ seq: 1 }))
    await pushTranslationMutation({
      videoId: 'v1',
      entry: { model: 'm', originalLang: 'en', segments: [] },
      deleted: false
    })
    expect(fetch.mock.calls[0][0]).toBe('https://relay.test/sync/translations/push')
  })
})

describe('pullOnce', () => {
  it('applies pulled link mutations and advances the seq cursor', async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ seq: 1, id: 'r1', value: 'https://remote.test', deleted: false, createdAt: 1 }],
          latestSeq: 1
        })
      )
      .mockResolvedValueOnce(jsonResponse({ items: [], latestSeq: 0 }))

    await pullOnce()
    expect(await listLinks()).toEqual(['https://remote.test'])
  })

  it('is a no-op with no session', async () => {
    loadSession.mockResolvedValue(null)
    refreshIfNeeded.mockResolvedValue(null)
    await pullOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('bootstrapIfNeeded', () => {
  it('pushes all existing local links once when the journal is empty (seq 0)', async () => {
    await addLink('https://a.test')
    await addLink('https://b.test')
    fetch.mockResolvedValue(jsonResponse({ seq: 1 }))

    await bootstrapIfNeeded()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there is no session', async () => {
    loadSession.mockResolvedValue(null)
    refreshIfNeeded.mockResolvedValue(null)
    await addLink('https://a.test')
    await bootstrapIfNeeded()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('startSync', () => {
  it('is a no-op on Android (no WebSocket, no bootstrap)', async () => {
    isAndroidPlatform.mockReturnValue(true)
    const OriginalWebSocket = WebSocket
    const wsSpy = vi.fn()
    vi.stubGlobal('WebSocket', wsSpy)

    await startSync()
    expect(wsSpy).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()

    vi.stubGlobal('WebSocket', OriginalWebSocket)
  })

  it('opens a WebSocket and sends hello on desktop', async () => {
    const sent = []
    class FakeWebSocket {
      constructor(url) {
        this.url = url
        this.listeners = {}
        FakeWebSocket.instances.push(this)
        queueMicrotask(() => {
          for (const fn of this.listeners.open ?? []) fn()
        })
      }

      addEventListener(type, fn) {
        const forType = (this.listeners[type] ??= [])
        forType.push(fn)
      }

      send(data) {
        sent.push(JSON.parse(data))
      }

      close() {
        // test double: nothing to release
      }
    }
    FakeWebSocket.OPEN = 1
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)

    await startSync()
    await vi.waitFor(() => expect(sent.some(m => m.type === 'hello')).toBe(true))

    expect(FakeWebSocket.instances[0].url).toBe('wss://relay.test/sync/ws')
    const hello = sent.find(m => m.type === 'hello')
    expect(hello.token).toBe('at')
  })
})
