import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTest, verifyAccessToken } from './auth.js'

const ISSUER = 'https://id.test/oauth2'
const CLIENT_ID = 'myshare'

/**
 * @returns {Promise<{privateKey: CryptoKey, resolver: import('jose').JWTVerifyGetKey}>} a fresh RS256 keypair plus a JWKS resolver
 */
async function makeLocalKeyset() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'test-key'
  jwk.alg = 'RS256'
  // jose's createLocalJWKSet expects a {keys: [...]} JWKS document plus a resolver function;
  // simplest is to build the resolver by hand rather than pull in createLocalJWKSet here.
  const resolver = () => publicKey
  return { privateKey, resolver }
}

/**
 * @param {CryptoKey} privateKey the key to sign with
 * @param {{iss?: string, aud?: string, sub?: string, exp?: string}} [overrides] claim overrides for negative-path tests
 * @returns {Promise<string>} a signed JWT
 */
function signToken(privateKey, overrides = {}) {
  return new SignJWT({ ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuedAt()
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? CLIENT_ID)
    .setSubject(overrides.sub ?? 'user-123')
    .setExpirationTime(overrides.exp ?? '1h')
    .sign(privateKey)
}

beforeEach(() => {
  _resetForTest()
})

describe('verifyAccessToken', () => {
  it('resolves the userId (JWT sub) for a valid token', async () => {
    const { privateKey, resolver } = await makeLocalKeyset()
    const token = await signToken(privateKey)

    const result = await verifyAccessToken(token, { issuer: ISSUER, clientId: CLIENT_ID, jwks: resolver })
    expect(result.userId).toBe('user-123')
  })

  it('rejects a missing token', async () => {
    await expect(verifyAccessToken(null, { issuer: ISSUER, clientId: CLIENT_ID })).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    const { privateKey, resolver } = await makeLocalKeyset()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject('user-123')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)

    await expect(verifyAccessToken(token, { issuer: ISSUER, clientId: CLIENT_ID, jwks: resolver })).rejects.toThrow()
  })

  it('rejects a wrong audience (different client_id)', async () => {
    const { privateKey, resolver } = await makeLocalKeyset()
    const token = await signToken(privateKey, { aud: 'some-other-app' })

    await expect(verifyAccessToken(token, { issuer: ISSUER, clientId: CLIENT_ID, jwks: resolver })).rejects.toThrow()
  })

  it('rejects a wrong issuer', async () => {
    const { privateKey, resolver } = await makeLocalKeyset()
    const token = await signToken(privateKey, { iss: 'https://not-the-issuer.test' })

    await expect(verifyAccessToken(token, { issuer: ISSUER, clientId: CLIENT_ID, jwks: resolver })).rejects.toThrow()
  })
})
