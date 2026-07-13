import { beforeEach, describe, expect, it } from 'vitest'
import {
  _applyRemoteLinkMutation,
  _lastSyncedSeq,
  _resetForTest,
  _setLastSyncedSeq,
  addLink,
  listLinkRecords,
  listLinks,
  removeLink
} from './link-store.js'

// happy-dom has no OPFS, so these exercise the in-memory fallback path.

beforeEach(() => {
  _resetForTest()
})

describe('link-store (in-memory fallback)', () => {
  it('starts empty', async () => {
    expect(await listLinks()).toEqual([])
  })

  it('prepends new links newest-first', async () => {
    await addLink('https://a.test')
    await addLink('https://b.test')
    expect(await listLinks()).toEqual(['https://b.test', 'https://a.test'])
  })

  it('deduplicates', async () => {
    await addLink('https://a.test')
    await addLink('https://a.test')
    expect(await listLinks()).toEqual(['https://a.test'])
  })

  it('ignores empty / non-string input', async () => {
    expect(await addLink('')).toEqual([])
    expect(await addLink(null)).toEqual([])
    expect(await listLinks()).toEqual([])
  })

  it('returns the updated list from addLink', async () => {
    expect(await addLink('https://a.test')).toEqual(['https://a.test'])
  })

  it('removeLink tombstones without physically deleting the record', async () => {
    await addLink('https://a.test')
    await addLink('https://b.test')
    expect(await removeLink('https://a.test')).toEqual(['https://b.test'])
    expect(await listLinks()).toEqual(['https://b.test'])
    // still present internally as a deleted record, not wiped:
    const records = await listLinkRecords()
    expect(records.map(r => r.url)).toEqual(['https://b.test'])
  })

  it('removeLink is a no-op for an unknown url', async () => {
    await addLink('https://a.test')
    expect(await removeLink('https://missing.test')).toEqual(['https://a.test'])
  })

  it('_applyRemoteLinkMutation inserts an unknown id and is idempotent', async () => {
    await _applyRemoteLinkMutation({ id: 'r1', url: 'https://remote.test', deleted: false, createdAt: 1, seq: 5 })
    await _applyRemoteLinkMutation({ id: 'r1', url: 'https://remote.test', deleted: false, createdAt: 1, seq: 5 })
    expect(await listLinks()).toEqual(['https://remote.test'])
    expect(await _lastSyncedSeq()).toBe(5)
  })

  it('_applyRemoteLinkMutation tombstones a known id', async () => {
    await _applyRemoteLinkMutation({ id: 'r1', url: 'https://remote.test', deleted: false, createdAt: 1, seq: 1 })
    await _applyRemoteLinkMutation({ id: 'r1', url: null, deleted: true, seq: 2 })
    expect(await listLinks()).toEqual([])
  })

  it('_lastSyncedSeq/_setLastSyncedSeq round-trip', async () => {
    expect(await _lastSyncedSeq()).toBe(0)
    await _setLastSyncedSeq(42)
    expect(await _lastSyncedSeq()).toBe(42)
  })
})

// Minimal in-memory OPFS mock (happy-dom has none) so migration can be exercised
// through the real readState()/writeState() OPFS code path, not just the fallback.
/**
 * @param {Record<string, string>} [initialFiles] pre-seeded file contents, keyed by filename
 * @returns {Map<string, string>} the mock filesystem backing store, for post-assertions
 */
function installFakeOpfs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles))
  const root = {
    getFileHandle(name, opts) {
      if (!files.has(name)) {
        if (!opts?.create) throw new Error('not found')
        files.set(name, '')
      }
      return {
        getFile() {
          return { text: () => files.get(name) }
        },
        createWritable() {
          return {
            write(text) {
              files.set(name, text)
            },
            close() {
              // test double: nothing to release
            }
          }
        }
      }
    }
  }
  globalThis.navigator = { storage: { getDirectory: () => root } }
  return files
}

describe('link-store migration (old flat-array format)', () => {
  beforeEach(() => {
    _resetForTest()
    delete globalThis.navigator
  })

  it('upgrades a pre-sync string[] into non-deleted items, preserving all URLs and order', async () => {
    installFakeOpfs({ 'links.json': JSON.stringify(['https://b.test', 'https://a.test']) })

    expect(await listLinks()).toEqual(['https://b.test', 'https://a.test'])

    const records = await listLinkRecords()
    expect(records).toHaveLength(2)
    expect(records.every(r => typeof r.id === 'string' && r.id.length > 0)).toBe(true)
    expect(records.every(r => r.deleted === false)).toBe(true)
  })

  it('persists the upgraded shape so migration runs only once', async () => {
    const files = installFakeOpfs({ 'links.json': JSON.stringify(['https://a.test']) })
    await listLinks()
    const persisted = JSON.parse(files.get('links.json'))
    expect(persisted.version).toBe(2)
    expect(Array.isArray(persisted.items)).toBe(true)
  })
})
