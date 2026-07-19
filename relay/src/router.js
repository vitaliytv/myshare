import { verifyAccessToken } from './auth.js'
import { applyPush, pullSince } from './sync.js'

/**
 * @param {Request} req the incoming HTTP request
 * @returns {string|null} the bearer token from the Authorization header, or null if absent/malformed
 */
function bearerToken(req) {
  const header = req.headers.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  return scheme === 'Bearer' ? token : null
}

/**
 * @param {object} db the open relay database
 * @param {{issuer: string, clientId: string}} authConfig Hydra issuer + client id for JWT verification
 * @returns {object} the Bun.serve handlers
 */
export function createRouter(db, authConfig) {
  /** @type {Map<string, Set<object>>} */
  const liveSockets = new Map()

  /**
   * @param {string} userId the recipient user ID
   * @param {object|null} fromWs the socket that initiated the message, if any
   * @param {object} message the synchronization message to send
   * @returns {void} nothing
   */
  function broadcast(userId, fromWs, message) {
    const sockets = liveSockets.get(userId)
    if (!sockets) return
    const payload = JSON.stringify(message)
    for (const ws of sockets) {
      if (ws !== fromWs) ws.send(payload)
    }
  }

  /**
   * @param {Request} req the incoming HTTP request
   * @param {string} table the synchronization table name
   * @returns {Promise<Response>} the latest sequence response
   */
  async function handlePush(req, table) {
    const { userId } = await verifyAccessToken(bearerToken(req), authConfig)
    const body = await req.json()
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : 'unknown'
    let latestSeq = 0
    for (const item of body.items ?? []) {
      latestSeq = applyPush(db, table, userId, item, deviceId)
      broadcast(userId, null, { type: 'push', table, item: { ...item, seq: latestSeq, deviceId } })
    }
    return Response.json({ seq: latestSeq })
  }

  /**
   * @param {Request} req the incoming HTTP request
   * @param {string} table the synchronization table name
   * @param {URL} url the parsed request URL
   * @returns {Promise<Response>} the synchronization items response
   */
  async function handlePull(req, table, url) {
    const { userId } = await verifyAccessToken(bearerToken(req), authConfig)
    const since = Number(url.searchParams.get('since') ?? '0')
    const items = pullSince(db, table, userId, since)
    const latestSeq = items.at(-1)?.seq ?? since
    return Response.json({ items, latestSeq })
  }

  /**
   * @param {Request} req the incoming HTTP request
   * @param {object} server the Bun server handling the request
   * @returns {Promise<Response|undefined>} the route response or an upgraded connection
   */
  async function fetchHandler(req, server) {
    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') return new Response('ok')

    if (url.pathname === '/sync/ws') {
      const upgraded = server.upgrade(req, { data: { userId: null, deviceId: null } })
      return upgraded ? undefined : new Response('WebSocket upgrade failed', { status: 400 })
    }

    try {
      if (req.method === 'POST' && url.pathname === '/sync/links/push') return await handlePush(req, 'links')
      if (req.method === 'GET' && url.pathname === '/sync/links/pull') return await handlePull(req, 'links', url)
      if (req.method === 'POST' && url.pathname === '/sync/translations/push') return await handlePush(req, 'translations')
      if (req.method === 'GET' && url.pathname === '/sync/translations/pull') return await handlePull(req, 'translations', url)
    }
    catch {
      return new Response('unauthorized', { status: 401 })
    }

    return new Response('not found', { status: 404 })
  }

  const websocket = {
    async message(ws, raw) {
      let msg
      try {
        msg = JSON.parse(String(raw))
      }
      catch {
        return
      }

      if (msg.type === 'hello') {
        try {
          const { userId } = await verifyAccessToken(msg.token, authConfig)
          ws.data.userId = userId
          ws.data.deviceId = msg.deviceId
          if (!liveSockets.has(userId)) liveSockets.set(userId, new Set())
          liveSockets.get(userId).add(ws)
          const linksCatchup = pullSince(db, 'links', userId, msg.linksSince ?? 0)
          const translationsCatchup = pullSince(db, 'translations', userId, msg.translationsSince ?? 0)
          ws.send(JSON.stringify({ type: 'catchup', links: linksCatchup, translations: translationsCatchup }))
        }
        catch {
          ws.close(4001, 'unauthorized')
        }
        return
      }

      if (msg.type === 'push' && ws.data.userId) {
        const seq = applyPush(db, msg.table, ws.data.userId, msg.item, ws.data.deviceId ?? 'unknown')
        ws.send(JSON.stringify({ type: 'push-ack', table: msg.table, id: msg.item.id, seq }))
        broadcast(ws.data.userId, ws, { type: 'push', table: msg.table, item: { ...msg.item, seq, deviceId: ws.data.deviceId } })
      }
    },
    close(ws) {
      const sockets = ws.data.userId ? liveSockets.get(ws.data.userId) : null
      sockets?.delete(ws)
    }
  }

  return { fetch: fetchHandler, websocket }
}
