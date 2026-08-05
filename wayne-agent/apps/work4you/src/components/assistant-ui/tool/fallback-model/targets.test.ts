import { describe, expect, it } from 'vitest'

import { isPreviewableTarget, looksLikePath } from './targets'

describe('isPreviewableTarget', () => {
  it('accepts bare and Windows HTML paths (Dutelog / landing.html)', () => {
    expect(isPreviewableTarget('landing.html')).toBe(true)
    expect(isPreviewableTarget('C:\\Users\\leo\\Dutelog\\landing.html')).toBe(true)
    expect(isPreviewableTarget('C:/Users/leo/Dutelog/index.html')).toBe(true)
    expect(isPreviewableTarget('./dist/index.html')).toBe(true)
  })

  it('accepts localhost and file URLs', () => {
    expect(isPreviewableTarget('http://localhost:5173/')).toBe(true)
    expect(isPreviewableTarget('file:///C:/Users/leo/Dutelog/landing.html')).toBe(true)
  })

  it('rejects non-html relative noise', () => {
    expect(isPreviewableTarget('readme.md')).toBe(false)
    expect(isPreviewableTarget('https://example.com')).toBe(false)
  })
})

describe('looksLikePath', () => {
  it('accepts Windows absolute paths', () => {
    expect(looksLikePath('C:\\Users\\leo\\Dutelog\\landing.html')).toBe(true)
  })
})
