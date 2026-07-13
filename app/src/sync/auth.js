// PKCE (RFC 7636) login against Ory Hydra's OAuth2 Authorization Code flow.
// The relay has no login of its own — Ory (Kratos + Hydra) is the identity
// provider; this module gets an access/refresh/id token triple and hands them
// to session-store.js. See relay/README.md for the one-time Hydra client
// registration this depends on (public client, PKCE-enforced).
//
// Endpoints are resolved via OIDC discovery (`<issuer>/.well-known/openid-configuration`)
// rather than hardcoded paths: the dev ory stack proxies Hydra behind login-ui's nginx,
// which can double up the `/oauth2` prefix (`<issuer>/oauth2/auth` vs `/oauth2/oauth2/auth`
// depending on deployment) — discovery is the standard way to avoid guessing that.

import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { openUrl } from '@tauri-apps/plugin-opener'
import { loadSession, saveSession } from './session-store.js'

const REDIRECT_URI = 'myshare://oauth/callback'
const SCOPE = 'openid offline email profile'
// Refresh proactively once less than this much of the access token's life remains.
const REFRESH_MARGIN_MS = 60_000

// In-memory only — a login flow's PKCE verifier/state never need to survive
// an app restart (if the browser round-trip outlives the app process, the user
// just retries login).
let pendingLogin = null

const discoveryCache = new Map()

/**
 * @param {string} oryIssuer the Ory Hydra issuer base URL (e.g. `https://id.nitra.dev/oauth2`)
 * @returns {Promise<{authorizationEndpoint: string, tokenEndpoint: string}>} discovered OIDC endpoints
 */
async function discover(oryIssuer) {
  if (discoveryCache.has(oryIssuer)) return discoveryCache.get(oryIssuer)
  const response = await fetch(`${oryIssuer}/.well-known/openid-configuration`)
  if (!response.ok) throw new Error(`OIDC discovery failed: ${response.status}`)
  const doc = await response.json()
  const endpoints = { authorizationEndpoint: doc.authorization_endpoint, tokenEndpoint: doc.token_endpoint }
  discoveryCache.set(oryIssuer, endpoints)
  return endpoints
}

/**
 * @param {Uint8Array} bytes raw bytes to encode
 * @returns {string} base64url (no padding) encoding of `bytes`
 */
function base64url(bytes) {
  let str = ''
  for (const byte of bytes) str += String.fromCodePoint(byte)
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/**
 * @returns {Promise<{codeVerifier: string, codeChallenge: string}>} a fresh PKCE (S256) pair
 */
export async function generatePkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const codeVerifier = base64url(verifierBytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const codeChallenge = base64url(new Uint8Array(digest))
  return { codeVerifier, codeChallenge }
}

/**
 * @param {{authorizationEndpoint: string, clientId: string, codeChallenge: string, state: string}} params the discovered endpoint plus PKCE/CSRF params
 * @returns {string} the authorize URL to open in the system browser
 */
export function buildAuthorizeUrl({ authorizationEndpoint, clientId, codeChallenge, state }) {
  const url = new URL(authorizationEndpoint)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * @param {string} callbackUrl the full `myshare://oauth/callback?...` URL
 * @returns {{code: string|null, state: string|null, error: string|null}} the parsed callback query params
 */
export function parseCallbackUrl(callbackUrl) {
  const url = new URL(callbackUrl)
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    error: url.searchParams.get('error')
  }
}

/**
 * Open the system browser on Hydra's authorize endpoint. Resolves once the
 * browser has been asked to open — the actual login completes asynchronously
 * via the deep-link callback (see listenForOAuthCallback / completeLogin).
 * @param {{relayUrl: string, oryIssuer: string, clientId: string}} config relay + Ory config to log into
 * @returns {Promise<void>}
 */
export async function startLogin({ relayUrl, oryIssuer, clientId }) {
  const { authorizationEndpoint } = await discover(oryIssuer)
  const { codeVerifier, codeChallenge } = await generatePkcePair()
  const state = crypto.randomUUID()
  pendingLogin = { relayUrl, oryIssuer, clientId, codeVerifier, state }
  await openUrl(buildAuthorizeUrl({ authorizationEndpoint, clientId, codeChallenge, state }))
}

/**
 * @param {string} tokenEndpoint the discovered Hydra token endpoint
 * @param {Record<string, string>} body the `application/x-www-form-urlencoded` grant params
 * @returns {Promise<object>} the parsed token response
 */
async function exchangeToken(tokenEndpoint, body) {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  })
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`)
  return response.json()
}

/**
 * Complete a login started with startLogin(), given the deep-link callback URL.
 * @param {string} callbackUrl the `myshare://oauth/callback?...` URL from the deep-link handler
 * @returns {Promise<object>} the saved session
 */
export async function completeLogin(callbackUrl) {
  const { code, state, error } = parseCallbackUrl(callbackUrl)
  if (error) throw new Error(`oauth error: ${error}`)
  if (!pendingLogin || state !== pendingLogin.state) throw new Error('no matching login in progress')
  if (!code) throw new Error('callback missing code')

  const { relayUrl, oryIssuer, clientId, codeVerifier } = pendingLogin
  pendingLogin = null

  const { tokenEndpoint } = await discover(oryIssuer)
  const tokens = await exchangeToken(tokenEndpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: codeVerifier
  })

  const session = {
    relayUrl,
    oryIssuer,
    clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresAt: Date.now() + tokens.expires_in * 1000
  }
  await saveSession(session)
  return session
}

/**
 * @returns {void}
 */
function noop() {
  // default no-op error handler for listenForOAuthCallback
}

/**
 * Register the deep-link handler for the OAuth callback scheme. Call once at app start.
 * @param {(session: object) => void} onLoggedIn called once completeLogin() resolves
 * @param {(error: Error) => void} [onError] called if completeLogin() rejects; defaults to swallowing
 * @returns {Promise<() => void>} unlisten function
 */
export function listenForOAuthCallback(onLoggedIn, onError) {
  return onOpenUrl(urls => {
    const callbackUrl = urls.find(u => u.startsWith(REDIRECT_URI))
    if (!callbackUrl) return
    completeLogin(callbackUrl)
      .then(onLoggedIn)
      .catch(onError ?? noop)
  })
}

/**
 * Refresh the access token if it's at/near expiry. No-op (returns the session
 * unchanged) if there's no session or plenty of time remains.
 * @param {object|null} [session] pass the already-loaded session to avoid a re-read
 * @returns {Promise<object|null>} the (possibly refreshed) session, or null if logged out
 */
export async function refreshIfNeeded(session) {
  const current = session ?? (await loadSession())
  if (!current) return null
  if (current.expiresAt - Date.now() > REFRESH_MARGIN_MS) return current

  const { tokenEndpoint } = await discover(current.oryIssuer)
  const tokens = await exchangeToken(tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
    client_id: current.clientId
  })
  const next = {
    ...current,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? current.refreshToken,
    idToken: tokens.id_token ?? current.idToken,
    expiresAt: Date.now() + tokens.expires_in * 1000
  }
  await saveSession(next)
  return next
}

/**
 * Test seam: forget any in-progress login and cached OIDC discovery.
 * @returns {void}
 */
export function _resetForTest() {
  pendingLogin = null
  discoveryCache.clear()
}
