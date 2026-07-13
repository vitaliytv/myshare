import { beforeEach, describe, expect, it, vi } from 'vitest'

const openUrl = vi.fn()
const onOpenUrl = vi.fn()

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (...args) => openUrl(...args) }))
vi.mock('@tauri-apps/plugin-deep-link', () => ({ onOpenUrl: (...args) => onOpenUrl(...args) }))

const {
  _resetForTest,
  buildAuthorizeUrl,
  completeLogin,
  generatePkcePair,
  listenForOAuthCallback,
  parseCallbackUrl,
  refreshIfNeeded,
  startLogin
} = await import('./auth.js')
const { _resetForTest: resetSession, loadSession } = await import('./session-store.js')

const CONFIG = { relayUrl: 'https://relay.test', oryIssuer: 'https://id.test/oauth2', clientId: 'myshare' }
const DISCOVERY_DOC = {
  authorization_endpoint: 'https://id.test/oauth2/oauth2/auth',
  token_endpoint: 'https://id.test/oauth2/oauth2/token'
}
const URL_SAFE_RE = /^[A-Za-z0-9_-]+$/

/**
 * @param {...object} tokenResponses one parsed JSON body per expected token-endpoint call, in order
 * @returns {import('vitest').Mock} the stubbed global `fetch`
 */
function mockDiscoveryThen(...tokenResponses) {
  const fetchMock = vi.fn()
  fetchMock.mockResolvedValueOnce({ ok: true, json: () => DISCOVERY_DOC })
  for (const body of tokenResponses) fetchMock.mockResolvedValueOnce({ ok: true, json: () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('generatePkcePair', () => {
  it('produces a url-safe verifier and a distinct challenge', async () => {
    const { codeVerifier, codeChallenge } = await generatePkcePair()
    expect(codeVerifier).toMatch(URL_SAFE_RE)
    expect(codeChallenge).toMatch(URL_SAFE_RE)
    expect(codeChallenge).not.toBe(codeVerifier)
  })

  it('generates a different verifier every call', async () => {
    const a = await generatePkcePair()
    const b = await generatePkcePair()
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
  })
})

describe('buildAuthorizeUrl / parseCallbackUrl', () => {
  it('builds the authorize URL (from a discovered endpoint) with PKCE params', () => {
    const url = buildAuthorizeUrl({
      authorizationEndpoint: DISCOVERY_DOC.authorization_endpoint,
      clientId: 'myshare',
      codeChallenge: 'chal',
      state: 'st'
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://id.test/oauth2/oauth2/auth')
    expect(parsed.searchParams.get('client_id')).toBe('myshare')
    expect(parsed.searchParams.get('redirect_uri')).toBe('myshare://oauth/callback')
    expect(parsed.searchParams.get('code_challenge')).toBe('chal')
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    expect(parsed.searchParams.get('state')).toBe('st')
  })

  it('parses code/state/error from the callback URL', () => {
    expect(parseCallbackUrl('myshare://oauth/callback?code=abc&state=xyz')).toEqual({
      code: 'abc',
      state: 'xyz',
      error: null
    })
    expect(parseCallbackUrl('myshare://oauth/callback?error=access_denied').error).toBe('access_denied')
  })
})

describe('startLogin / completeLogin', () => {
  beforeEach(() => {
    _resetForTest()
    resetSession()
    openUrl.mockReset()
  })

  it('discovers endpoints, opens the system browser, and completes login on a matching callback', async () => {
    mockDiscoveryThen({ access_token: 'at', refresh_token: 'rt', id_token: 'it', expires_in: 3600 })

    await startLogin(CONFIG)
    expect(openUrl).toHaveBeenCalledTimes(1)
    const openedUrl = new URL(openUrl.mock.calls.at(-1)[0])
    expect(openedUrl.origin + openedUrl.pathname).toBe(DISCOVERY_DOC.authorization_endpoint)
    const state = openedUrl.searchParams.get('state')

    const session = await completeLogin(`myshare://oauth/callback?code=c1&state=${state}`)
    expect(session.accessToken).toBe('at')
    expect(await loadSession()).toEqual(session)
  })

  it('rejects a callback whose state does not match the pending login', async () => {
    mockDiscoveryThen()
    await startLogin(CONFIG)
    await expect(completeLogin('myshare://oauth/callback?code=c1&state=wrong')).rejects.toThrow()
  })

  it('rejects an oauth error callback', async () => {
    mockDiscoveryThen()
    await startLogin(CONFIG)
    await expect(completeLogin('myshare://oauth/callback?error=access_denied')).rejects.toThrow('access_denied')
  })
})

describe('refreshIfNeeded', () => {
  beforeEach(() => {
    _resetForTest()
    resetSession()
  })

  it('is a no-op when the token has plenty of life left', async () => {
    const fresh = { ...CONFIG, accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await refreshIfNeeded(fresh)
    expect(result).toBe(fresh)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes when the token is at/near expiry', async () => {
    mockDiscoveryThen({ access_token: 'new', refresh_token: 'rt2', expires_in: 3600 })
    const stale = { ...CONFIG, accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() - 1 }
    const result = await refreshIfNeeded(stale)
    expect(result.accessToken).toBe('new')
    expect(await loadSession()).toEqual(result)
  })

  it('returns null when there is no session', async () => {
    expect(await refreshIfNeeded(null)).toBeNull()
  })
})

describe('listenForOAuthCallback', () => {
  beforeEach(() => {
    _resetForTest()
    resetSession()
    openUrl.mockReset()
    onOpenUrl.mockReset()
  })

  it('completes login when the deep-link matches the oauth callback scheme', async () => {
    mockDiscoveryThen({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })

    await startLogin(CONFIG)
    const openedUrl = new URL(openUrl.mock.calls.at(-1)[0])
    const state = openedUrl.searchParams.get('state')

    let capturedHandler
    onOpenUrl.mockImplementation(handler => {
      capturedHandler = handler
      return () => {
        // test double: nothing to unlisten
      }
    })

    const onLoggedIn = vi.fn()
    await listenForOAuthCallback(onLoggedIn)
    await capturedHandler([`myshare://oauth/callback?code=c1&state=${state}`])
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalled())
  })
})
