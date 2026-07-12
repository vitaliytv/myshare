import { tableSpec } from './db.js'

/**
 * Append one journal entry for a user's mutation (an add or a tombstone).
 * @param {import('bun:sqlite').Database} db
 * @param {'links'|'translations'} table
 * @param {string} userId Ory identity id (JWT `sub`)
 * @param {{id: string, value: unknown, deleted?: boolean, createdAt?: number}} item
 * @param {string} deviceId originating device, for echo-suppression by callers
 * @returns {number} assigned seq
 */
export function applyPush(db, table, userId, item, deviceId) {
  const { table: tableName, idCol, valueCol } = tableSpec(table)
  const deleted = item.deleted ? 1 : 0
  const value = deleted ? null : JSON.stringify(item.value)
  const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now()
  const stmt = db.prepare(
    `INSERT INTO ${tableName} (user_id, ${idCol}, ${valueCol}, deleted, device_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
  const result = stmt.run(userId, item.id, value, deleted, deviceId, createdAt)
  return Number(result.lastInsertRowid)
}

/**
 * Fetch journal rows for a user newer than `since`, ascending by seq.
 * @param {import('bun:sqlite').Database} db
 * @param {'links'|'translations'} table
 * @param {string} userId
 * @param {number} since
 * @returns {Array<{seq: number, id: string, value: unknown, deleted: boolean, deviceId: string, createdAt: number}>}
 */
export function pullSince(db, table, userId, since) {
  const { table: tableName, idCol, valueCol } = tableSpec(table)
  const rows = db
    .prepare(
      `SELECT seq, ${idCol} as id, ${valueCol} as value, deleted, device_id as deviceId, created_at as createdAt
       FROM ${tableName} WHERE user_id = ? AND seq > ? ORDER BY seq ASC`
    )
    .all(userId, since)
  return rows.map(row => ({
    seq: row.seq,
    id: row.id,
    value: row.deleted ? null : JSON.parse(row.value),
    deleted: Boolean(row.deleted),
    deviceId: row.deviceId,
    createdAt: row.createdAt
  }))
}
