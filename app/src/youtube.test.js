import { describe, expect, test, vi, beforeEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invokeMock(...args) }))

const { extractYoutubeVideoId, getYoutubeTranscript, getYoutubeLanguages } = await import('./youtube.js')

beforeEach(() => {
  invokeMock.mockReset()
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

describe('getYoutubeTranscript', () => {
  test('викликає yt_get_transcript із videoId і preferred', async () => {
    invokeMock.mockResolvedValueOnce({
      languageCode: 'uk',
      text: 'Привіт\nСвіт',
      availableLangs: ['uk', 'en']
    })
    const result = await getYoutubeTranscript('dQw4w9WgXcQ', ['uk', 'en'])
    expect(invokeMock).toHaveBeenCalledWith('yt_get_transcript', {
      videoId: 'dQw4w9WgXcQ',
      preferred: ['uk', 'en']
    })
    expect(result.languageCode).toBe('uk')
    expect(result.text).toBe('Привіт\nСвіт')
  })

  test('throws на некоректний videoId без виклику invoke', async () => {
    await expect(getYoutubeTranscript('bad-id', ['uk'])).rejects.toThrow('invalid YouTube video id')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  test('пробрасує помилку Rust (рядок)', async () => {
    invokeMock.mockRejectedValueOnce('supadata API key не налаштовано...')
    await expect(getYoutubeTranscript('dQw4w9WgXcQ', ['uk'])).rejects.toMatch(/supadata/)
  })
})

describe('getYoutubeLanguages', () => {
  test('викликає yt_list_languages із videoId', async () => {
    invokeMock.mockResolvedValueOnce(['uk', 'en', 'de'])
    const result = await getYoutubeLanguages('dQw4w9WgXcQ')
    expect(invokeMock).toHaveBeenCalledWith('yt_list_languages', { videoId: 'dQw4w9WgXcQ' })
    expect(result).toEqual(['uk', 'en', 'de'])
  })

  test('throws на некоректний videoId без виклику invoke', async () => {
    await expect(getYoutubeLanguages('bad-id')).rejects.toThrow('invalid YouTube video id')
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
