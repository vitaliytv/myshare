import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from './db.js'
import { applyPush, pullSince } from './sync.js'

let db

beforeEach(async () => {
  db = await openDb(':memory:')
})

describe('applyPush / pullSince (links)', () => {
  it('assigns monotonically increasing seq and returns pushed items ascending', () => {
    applyPush(db, 'links', 'u1', { id: 'l1', value: 'https://a.test', createdAt: 1 }, 'dev1')
    applyPush(db, 'links', 'u1', { id: 'l2', value: 'https://b.test', createdAt: 2 }, 'dev1')

    const items = pullSince(db, 'links', 'u1', 0)
    expect(items).toHaveLength(2)
    expect(items[0].seq).toBeLessThan(items[1].seq)
    expect(items.map(i => i.value)).toEqual(['https://a.test', 'https://b.test'])
  })

  it('pull-since-N only returns rows newer than N', () => {
    const seq1 = applyPush(db, 'links', 'u1', { id: 'l1', value: 'https://a.test' }, 'dev1')
    applyPush(db, 'links', 'u1', { id: 'l2', value: 'https://b.test' }, 'dev1')

    const items = pullSince(db, 'links', 'u1', seq1)
    expect(items.map(i => i.id)).toEqual(['l2'])
  })

  it('a tombstone push is retrievable and distinguishable (deleted=true, value=null)', () => {
    applyPush(db, 'links', 'u1', { id: 'l1', value: 'https://a.test' }, 'dev1')
    applyPush(db, 'links', 'u1', { id: 'l1', deleted: true }, 'dev2')

    const items = pullSince(db, 'links', 'u1', 0)
    const tombstone = items.at(-1)
    expect(tombstone.id).toBe('l1')
    expect(tombstone.deleted).toBe(true)
    expect(tombstone.value).toBeNull()
    expect(tombstone.deviceId).toBe('dev2')
  })

  it("does not leak one user's journal into another user's pull", () => {
    applyPush(db, 'links', 'u1', { id: 'l1', value: 'https://a.test' }, 'dev1')
    applyPush(db, 'links', 'u2', { id: 'l2', value: 'https://b.test' }, 'dev1')

    expect(pullSince(db, 'links', 'u1', 0).map(i => i.id)).toEqual(['l1'])
    expect(pullSince(db, 'links', 'u2', 0).map(i => i.id)).toEqual(['l2'])
  })
})

describe('applyPush / pullSince (translations)', () => {
  it('round-trips a JSON entry value', () => {
    const entry = { model: 'gemma4:e4b', originalLang: 'en', segments: [{ original: 'hi', translated: 'привіт' }] }
    applyPush(db, 'translations', 'u1', { id: 'vid1', value: entry }, 'dev1')

    const items = pullSince(db, 'translations', 'u1', 0)
    expect(items[0].value).toEqual(entry)
  })
})
