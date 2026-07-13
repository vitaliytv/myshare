import { describe, expect, it } from 'vitest'
import { openDb, tableSpec } from './db.js'

describe('openDb', () => {
  it('creates both journal tables with a working autoincrement seq', async () => {
    const db = await openDb(':memory:')
    const insert = db.prepare(
      'INSERT INTO link_journal (user_id, link_id, url, deleted, device_id, created_at) VALUES (?, ?, ?, 0, ?, ?)'
    )
    const first = insert.run('u1', 'l1', 'https://a.test', 'd1', 1)
    const second = insert.run('u1', 'l2', 'https://b.test', 'd1', 2)
    expect(Number(second.lastInsertRowid)).toBeGreaterThan(Number(first.lastInsertRowid))
  })

  it('is idempotent to call twice against the same db (IF NOT EXISTS)', async () => {
    const db = await openDb(':memory:')
    await expect(openDb(':memory:')).resolves.toBeTruthy()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name)
    expect(tables).toEqual(expect.arrayContaining(['link_journal', 'translation_journal']))
  })
})

describe('tableSpec', () => {
  it('resolves links and translations', () => {
    expect(tableSpec('links')).toEqual({ table: 'link_journal', idCol: 'link_id', valueCol: 'url' })
    expect(tableSpec('translations')).toEqual({ table: 'translation_journal', idCol: 'video_id', valueCol: 'entry' })
  })

  it('throws for an unknown table', () => {
    expect(() => tableSpec('bogus')).toThrow()
  })
})
