import { describe, expect, it } from 'vitest'

import { isAbsoluteFsPath, normalizeFsPath, pathIsInside, pathsEqual } from './fs-path'

describe('fs-path', () => {
  it('normalizes mixed separators and trailing slashes', () => {
    expect(normalizeFsPath('C:\\Users\\leo\\Dutelog\\')).toBe('c:/users/leo/dutelog')
    expect(normalizeFsPath('C:/Users/leo/Dutelog')).toBe('c:/users/leo/dutelog')
  })

  it('pathIsInside handles Windows nested paths', () => {
    const root = 'C:\\Users\\leo\\Dutelog'
    expect(pathIsInside(root, root)).toBe(true)
    expect(pathIsInside(root, 'C:\\Users\\leo\\Dutelog\\src')).toBe(true)
    expect(pathIsInside(root, 'C:/Users/leo/Dutelog/landing.html')).toBe(true)
    expect(pathIsInside(root, 'C:\\Users\\leo\\Other')).toBe(false)
  })

  it('pathsEqual ignores slash style and case', () => {
    expect(pathsEqual('C:\\A\\B', 'c:/a/b')).toBe(true)
  })

  it('isAbsoluteFsPath detects Windows drives', () => {
    expect(isAbsoluteFsPath('C:\\Users\\leo\\landing.html')).toBe(true)
    expect(isAbsoluteFsPath('landing.html')).toBe(false)
    expect(isAbsoluteFsPath('/tmp/x.html')).toBe(true)
  })
})
