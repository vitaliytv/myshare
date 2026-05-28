import { describe, expect, test, vi, beforeEach } from 'vitest'

// Мокаємо youtubei.js Innertube — не хочемо у unit-тестах робити реальні
// мережеві запити до YouTube (повільно, нестабільно, залежить від мережі).
// Конкретні тести самі підставляють потрібну поведінку getInfo/session.http.fetch.
const innertubeFactory = vi.fn()
vi.mock('youtubei.js', () => ({ Innertube: { create: (...args) => innertubeFactory(...args) } }))
// tauri fetch не використовується безпосередньо у нашому коді (його прокидає
// youtubei.js всередині), але імпорт `@tauri-apps/plugin-http` робиться при
// завантаженні модулю — треба мокнути, інакше vitest падає на спробі resolve'у.
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))

const {
  extractYoutubeVideoId,
  pickPreferredCaption,
  parseCaptionXml,
  parseCaptionJson3,
  findYoutubeCaption,
  fetchCaptionText,
  _resetInnertubeCacheForTest
} = await import('./youtube.js')

beforeEach(() => {
  innertubeFactory.mockReset()
  _resetInnertubeCacheForTest()
})

describe('extractYoutubeVideoId', () => {
  test('classic watch URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('watch URL з додатковими query params', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=foo')).toBe('dQw4w9WgXcQ')
  })

  test('youtu.be short URL', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('youtu.be з timestamp query', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=120')).toBe('dQw4w9WgXcQ')
  })

  test('shorts URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/abc12345678')).toBe('abc12345678')
  })

  test('embed URL', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('m.youtube.com (mobile)', () => {
    expect(extractYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('youtube-nocookie embed', () => {
    expect(extractYoutubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('не-YouTube → порожнє', () => {
    expect(extractYoutubeVideoId('https://example.com/video')).toBe('')
  })

  test('некоректний URL → порожнє', () => {
    expect(extractYoutubeVideoId('not a url')).toBe('')
  })

  test('youtube.com без videoId → порожнє', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/')).toBe('')
  })

  test('некоректний videoId формат → порожнє', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=tooshort')).toBe('')
  })
})

describe('pickPreferredCaption', () => {
  // Структура поля під формат youtubei.js (language_code + kind).
  const uk = { language_code: 'uk', base_url: 'u' }
  const ukAuto = { language_code: 'uk', kind: 'asr', base_url: 'ua' }
  const en = { language_code: 'en', base_url: 'e' }
  const enAuto = { language_code: 'en', kind: 'asr', base_url: 'ea' }
  const enUS = { language_code: 'en-US', base_url: 'eu' }

  test('пріоритет uk над en', () => {
    expect(pickPreferredCaption([en, uk], ['uk', 'en'])).toBe(uk)
  })

  test('manual uk перемагає auto uk', () => {
    expect(pickPreferredCaption([ukAuto, uk], ['uk', 'en'])).toBe(uk)
  })

  test('auto uk коли manual нема', () => {
    expect(pickPreferredCaption([ukAuto, en], ['uk', 'en'])).toBe(ukAuto)
  })

  test('en коли uk взагалі нема', () => {
    expect(pickPreferredCaption([en, enAuto], ['uk', 'en'])).toBe(en)
  })

  test('en-US матчиться як en (subtag stripped)', () => {
    expect(pickPreferredCaption([enUS], ['uk', 'en'])).toBe(enUS)
  })

  test('нічого з preferred → null', () => {
    expect(pickPreferredCaption([{ language_code: 'de' }], ['uk', 'en'])).toBeNull()
  })

  test('порожній список треків → null', () => {
    expect(pickPreferredCaption([], ['uk', 'en'])).toBeNull()
  })
})

describe('parseCaptionJson3', () => {
  test('склеює segs у рядки', () => {
    const json = {
      events: [
        { segs: [{ utf8: 'Never gonna ' }, { utf8: 'give you up' }] },
        { segs: [{ utf8: 'Never gonna ' }, { utf8: 'let you down' }] }
      ]
    }
    expect(parseCaptionJson3(json)).toBe('Never gonna give you up\nNever gonna let you down')
  })

  test('пропускає події без segs (padding/append-only)', () => {
    const json = {
      events: [{ segs: [{ utf8: 'line1' }] }, { aAppend: 1 }, { segs: [{ utf8: 'line2' }] }]
    }
    expect(parseCaptionJson3(json)).toBe('line1\nline2')
  })

  test('hard-break \\n у utf8 → пробіл', () => {
    const json = { events: [{ segs: [{ utf8: 'two\nwords' }] }] }
    expect(parseCaptionJson3(json)).toBe('two words')
  })

  test('events:[] / null / без поля → ""', () => {
    expect(parseCaptionJson3({})).toBe('')
    expect(parseCaptionJson3(null)).toBe('')
    expect(parseCaptionJson3({ events: [] })).toBe('')
  })
})

describe('parseCaptionXml', () => {
  test('legacy <transcript><text>', () => {
    expect(parseCaptionXml('<transcript><text>line1</text><text>line2</text></transcript>')).toBe('line1\nline2')
  })

  test('timedtext v3 <timedtext><body><p>', () => {
    const xml = '<timedtext format="3"><body><p>v3 line</p></body></timedtext>'
    expect(parseCaptionXml(xml)).toBe('v3 line')
  })

  test('legacy має пріоритет, якщо обидва є', () => {
    expect(parseCaptionXml('<root><text>legacy</text><p>v3</p></root>')).toBe('legacy')
  })

  test('порожнє → ""', () => {
    expect(parseCaptionXml('<transcript></transcript>')).toBe('')
  })
})

// Допоміжний билдер мок-інстанса Innertube. captionBody/captionOk потрібні
// лише тестам fetchCaptionText; для findYoutubeCaption-тестів httpFetch не
// викликається.
function mockInnertube({ tracks, captionBody = '', captionOk = true } = {}) {
  const httpFetch = vi.fn().mockResolvedValue({
    ok: captionOk,
    status: captionOk ? 200 : 500,
    text: async () => captionBody
  })
  const instance = {
    getInfo: vi.fn().mockResolvedValue({
      captions: { caption_tracks: tracks ?? [] }
    }),
    session: { http: { fetch: httpFetch } }
  }
  innertubeFactory.mockResolvedValue(instance)
  return { instance, httpFetch }
}

describe('findYoutubeCaption', () => {
  test('happy path — повертає summary track', async () => {
    const ukTrack = {
      language_code: 'uk',
      name: { text: 'Українська' },
      base_url: 'https://yt.example/api?v=ID&lang=uk'
    }
    const enTrack = { language_code: 'en', kind: 'asr', name: { text: 'English (auto)' }, base_url: 'https://yt/en' }
    mockInnertube({ tracks: [ukTrack, enTrack] })
    const summary = await findYoutubeCaption('dQw4w9WgXcQ', ['uk', 'en'])
    expect(summary).toEqual({
      languageCode: 'uk',
      name: 'Українська',
      isAuto: false,
      baseUrl: 'https://yt.example/api?v=ID&lang=uk'
    })
  })

  test('не викликає Innertube для некоректного videoId', async () => {
    expect(await findYoutubeCaption('bad-id', ['uk', 'en'])).toBeNull()
    expect(innertubeFactory).not.toHaveBeenCalled()
  })

  test('нема caption_tracks → null', async () => {
    mockInnertube({ tracks: [] })
    expect(await findYoutubeCaption('dQw4w9WgXcQ', ['uk', 'en'])).toBeNull()
  })

  test('нічого з preferred мов → null', async () => {
    mockInnertube({ tracks: [{ language_code: 'de', base_url: 'https://yt/de' }] })
    expect(await findYoutubeCaption('dQw4w9WgXcQ', ['uk', 'en'])).toBeNull()
  })

  test('Innertube.create синглтон між викликами', async () => {
    mockInnertube({ tracks: [{ language_code: 'en', name: { text: 'EN' }, base_url: 'https://yt/en' }] })
    await findYoutubeCaption('dQw4w9WgXcQ', ['en'])
    await findYoutubeCaption('dQw4w9WgXcQ', ['en'])
    expect(innertubeFactory).toHaveBeenCalledTimes(1)
  })
})

describe('fetchCaptionText', () => {
  test('happy path — json3 → plain text', async () => {
    const { httpFetch } = mockInnertube({
      tracks: [],
      captionBody: JSON.stringify({ events: [{ segs: [{ utf8: 'Привіт' }] }, { segs: [{ utf8: 'Світ' }] }] })
    })
    const text = await fetchCaptionText({ baseUrl: 'https://yt.example/api?v=ID&lang=uk' })
    expect(text).toBe('Привіт\nСвіт')
    const calledUrl = httpFetch.mock.calls[0][0]
    expect(calledUrl.searchParams.get('fmt')).toBe('json3')
  })

  test('fallback на XML коли body не JSON', async () => {
    mockInnertube({ tracks: [], captionBody: '<transcript><text>legacy</text></transcript>' })
    expect(await fetchCaptionText({ baseUrl: 'https://yt/x' })).toBe('legacy')
  })

  test('track без baseUrl → "" без HTTP', async () => {
    mockInnertube({ tracks: [], captionBody: '' })
    expect(await fetchCaptionText({})).toBe('')
    expect(await fetchCaptionText(null)).toBe('')
  })

  test('HTTP-помилка кидає', async () => {
    mockInnertube({ tracks: [], captionBody: '', captionOk: false })
    await expect(fetchCaptionText({ baseUrl: 'https://yt/x' })).rejects.toThrow('HTTP 500')
  })
})
