import { createRemoteJWKSet, jwtVerify } from 'jose'

// Hydra's own JWKS (`<issuer>/.well-known/jwks.json`) — distinct from the
// jwt-bridge JWKS at the ory stack's root, which is Hasura-shaped and unrelated.
let jwks = null
let jwksIssuer = null

/**
 * @param {string} issuer the Hydra issuer whose JWKS to fetch/cache
 * @returns {import('jose').JWTVerifyGetKey} a cached remote JWKS resolver for `issuer`
 */
function getJwks(issuer) {
  if (!jwks || jwksIssuer !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksIssuer = issuer
  }
  return jwks
}

/**
 * Verify a Hydra-issued OAuth2 access token JWT.
 * @param {string} token bearer token from the Authorization header
 * @param {{issuer: string, clientId: string, jwks?: import('jose').JWTVerifyGetKey}} config
 *   `jwks` is an injectable key resolver (e.g. `jose.createLocalJWKSet`) for tests;
 *   production callers omit it and get the cached remote Hydra JWKS.
 * @returns {Promise<{userId: string}>} resolves with the Ory identity id (JWT `sub`)
 * @throws {Error} if the token is missing, expired, or fails issuer/audience checks
 */
export async function verifyAccessToken(token, { issuer, clientId, jwks: injectedJwks }) {
  if (!token) throw new Error('missing bearer token')
  const { payload } = await jwtVerify(token, injectedJwks ?? getJwks(issuer), {
    issuer,
    audience: clientId
  })
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token missing sub claim')
  return { userId: payload.sub }
}

/**
 * Test seam: reset the cached JWKS so a fresh issuer/keyset takes effect.
 * @returns {void}
 */
export function _resetForTest() {
  jwks = null
  jwksIssuer = null
}
