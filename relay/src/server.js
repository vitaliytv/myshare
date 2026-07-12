import { openDb } from './db.js'
import { createRouter } from './router.js'

const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.RELAY_DB_PATH ?? './relay.sqlite'
const issuer = process.env.HYDRA_ISSUER
const clientId = process.env.MYSHARE_CLIENT_ID

if (!issuer || !clientId) {
  throw new Error('HYDRA_ISSUER and MYSHARE_CLIENT_ID env vars are required')
}

const db = openDb(dbPath)
const { fetch, websocket } = createRouter(db, { issuer, clientId })

Bun.serve({ port, fetch, websocket })

console.log(`myshare-relay listening on :${port} (db: ${dbPath}, issuer: ${issuer})`)
