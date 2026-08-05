import { describe, expect, it } from 'vitest'

import { resolveSessionCreateCwd, setCloudProjectSlug, setRunTarget, setSessionRunTarget } from './run-target'

describe('resolveSessionCreateCwd', () => {
  it('never ships a Windows path when cloud is preferred', () => {
    setRunTarget('cloud')
    setSessionRunTarget('cloud')
    setCloudProjectSlug('')
    expect(resolveSessionCreateCwd('D:\\code\\app')).toBe('')
  })

  it('uses cloud project cwd when slug is set', () => {
    setRunTarget('cloud')
    setSessionRunTarget('cloud')
    setCloudProjectSlug('demo')
    expect(resolveSessionCreateCwd('D:\\code\\app')).toBe('/opt/data/projects/demo')
  })

  it('keeps local cwd for local brain', () => {
    setRunTarget('local')
    setSessionRunTarget('local')
    setCloudProjectSlug('')
    expect(resolveSessionCreateCwd('/home/user/proj')).toBe('/home/user/proj')
  })
})
