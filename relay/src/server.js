import { env as processEnv } from 'node:process'
import { checkEnv, env } from '@nitra/check-env'
import { openDb } from './db.js'
import { createRouter } from './router.js'

checkEnv(['HYDRA_ISSUER', 'MYSHARE_CLIENT_ID'])

const port = Number(processEnv.PORT ?? 8787)
const dbPath = processEnv.RELAY_DB_PATH ?? './relay.sqlite'
const issuer = env.HYDRA_ISSUER
const clientId = env.MYSHARE_CLIENT_ID

const db = await openDb(dbPath)
const { fetch, websocket } = createRouter(db, { issuer, clientId })

Bun.serve({ port, fetch, websocket })

console.log(`myshare-relay listening on :${port} (db: ${dbPath}, issuer: ${issuer})`)
