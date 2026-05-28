const URL_PATTERN = /https?:\/\/[^\s<>"]+/iu

export function extractSharedUrl(value) {
  if (typeof value !== 'string') return ''

  return value.match(URL_PATTERN)?.[0] ?? ''
}
