import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from './db.js'
import { createRouter } from './router.js'

let db
let fetchHandler

beforeEach(async () => {
  db = await openDb(':memory:')
  ;({ fetch: fetchHandler } = createRouter(db, { issuer: 'https://id.test/oauth2', clientId: 'myshare' }))
})

describe('GET /health', () => {
  it('responds 200 without requiring auth', async () => {
    const response = await fetchHandler(new Request('http://relay.test/health'), {})
    expect(response.status).toBe(200)
  })
})

describe('unknown routes', () => {
  it('responds 404', async () => {
    const response = await fetchHandler(new Request('http://relay.test/nope'), {})
    expect(response.status).toBe(404)
  })
})

describe('auth-gated routes', () => {
  it('responds 401 without a bearer token', async () => {
    const response = await fetchHandler(
      new Request('http://relay.test/sync/links/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [], deviceId: 'd1' })
      }),
      {}
    )
    expect(response.status).toBe(401)
  })
})
