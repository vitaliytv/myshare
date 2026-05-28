import { describe, expect, test, vi, beforeEach } from 'vitest'

// Мокаємо @tauri-apps/plugin-http ДО імпорту page-meta, інакше реальний
// модуль спробує дотягнутись до Tauri runtime у тестах і впаде.
const fetchMock = vi.fn()
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (...args) => fetchMock(...args) }))

const { fetchPageMeta, extractTitle, extractFaviconUrl, resolveUrl, parseHtml } = await import('./page-meta.js')

beforeEach(() => {
  fetchMock.mockReset()
})

// Хелпер: побудувати fetch-like Response з HTML.
function htmlResponse(html, { url = 'https://example.com/', status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    text: async () => html
  }
}

describe('extractTitle', () => {
  test('повертає trimmed title', () => {
    const doc = parseHtml('<html><head><title>  Hello  </title></head></html>')
    expect(extractTitle(doc)).toBe('Hello')
  })

  test('порожньо коли немає title', () => {
    const doc = parseHtml('<html><head></head></html>')
    expect(extractTitle(doc)).toBe('')
  })
})

describe('resolveUrl', () => {
  test('абсолютний URL залишається', () => {
    expect(resolveUrl('https://cdn.example.com/icon.png', 'https://site.com/page')).toBe(
      'https://cdn.example.com/icon.png'
    )
  })

  test('відносний з / резолвиться до origin', () => {
    expect(resolveUrl('/favicon.ico', 'https://site.com/deep/page?x=1')).toBe('https://site.com/favicon.ico')
  })

  test('відносний без / резолвиться до поточного каталогу', () => {
    expect(resolveUrl('icon.png', 'https://site.com/deep/page.html')).toBe('https://site.com/deep/icon.png')
  })

  test('некоректний URL → порожньо', () => {
    expect(resolveUrl('ht!tp:::', 'not a url')).toBe('')
  })
})

describe('extractFaviconUrl', () => {
  test('бере <link rel="icon"> першим', () => {
    const doc = parseHtml(`
      <html><head>
        <link rel="apple-touch-icon" href="/apple.png">
        <link rel="icon" href="/icon.png">
      </head></html>
    `)
    expect(extractFaviconUrl(doc, 'https://site.com/')).toBe('https://site.com/icon.png')
  })

  test('резолвить відносний href', () => {
    const doc = parseHtml('<html><head><link rel="icon" href="img/fav.ico"></head></html>')
    expect(extractFaviconUrl(doc, 'https://site.com/page')).toBe('https://site.com/img/fav.ico')
  })

  test('fallback на /favicon.ico коли нічого нема', () => {
    const doc = parseHtml('<html><head></head></html>')
    expect(extractFaviconUrl(doc, 'https://site.com/path')).toBe('https://site.com/favicon.ico')
  })

  test('shortcut icon коли немає звичайної', () => {
    const doc = parseHtml('<html><head><link rel="shortcut icon" href="/s.ico"></head></html>')
    expect(extractFaviconUrl(doc, 'https://site.com/')).toBe('https://site.com/s.ico')
  })

  test('apple-touch-icon коли немає інших', () => {
    const doc = parseHtml('<html><head><link rel="apple-touch-icon" href="/a.png"></head></html>')
    expect(extractFaviconUrl(doc, 'https://site.com/')).toBe('https://site.com/a.png')
  })

  test('rel="icon shortcut" (token icon у будь-якій позиції) теж знаходить', () => {
    const doc = parseHtml('<html><head><link rel="icon shortcut" href="/mixed.ico"></head></html>')
    expect(extractFaviconUrl(doc, 'https://site.com/')).toBe('https://site.com/mixed.ico')
  })
})

describe('fetchPageMeta', () => {
  test('повертає {title, favicon} для нормальної сторінки', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        '<html><head><title>Example Site</title><link rel="icon" href="/fav.ico"></head></html>',
        { url: 'https://example.com/' }
      )
    )
    const meta = await fetchPageMeta('https://example.com/')
    expect(meta).toEqual({
      title: 'Example Site',
      favicon: 'https://example.com/fav.ico'
    })
  })

  test('використовує response.url як base після redirects', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<html><head><title>Redirected</title><link rel="icon" href="/icon.png"></head></html>', {
        url: 'https://final.example.com/landing'
      })
    )
    const meta = await fetchPageMeta('https://short.ly/abc')
    expect(meta.favicon).toBe('https://final.example.com/icon.png')
  })

  test('передає User-Agent і Accept у запит', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<html><head><title>T</title></head></html>'))
    await fetchPageMeta('https://example.com/')
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers['User-Agent']).toMatch(/Mozilla/)
    expect(options.headers.Accept).toMatch(/text\/html/)
  })

  test('кидає Error на не-2xx статус', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('', { status: 500 }))
    await expect(fetchPageMeta('https://example.com/')).rejects.toThrow('HTTP 500')
  })

  test('пробрасує помилку fetch (мережева/timeout)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(fetchPageMeta('https://example.com/')).rejects.toThrow('network down')
  })

  test('fallback на /favicon.ico коли link нема', async () => {
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<html><head><title>NoIcon</title></head></html>', { url: 'https://noicon.com/' })
    )
    const meta = await fetchPageMeta('https://noicon.com/')
    expect(meta.favicon).toBe('https://noicon.com/favicon.ico')
  })
})
