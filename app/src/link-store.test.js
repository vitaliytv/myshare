import { beforeEach, describe, expect, it } from 'vitest'
import { _resetForTest, addLink, listLinks } from './link-store.js'

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
})
