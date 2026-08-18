import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('project chip F3', () => {
  it('does not force the Local brain when opening a PC folder', () => {
    const src = fs.readFileSync(path.join(__dirname, 'project-chip.tsx'), 'utf8')
    expect(src).not.toMatch(/setRunTarget\('local'\)/)
  })
})
