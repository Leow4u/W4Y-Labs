import { describe, expect, it } from 'vitest'

import { readApprovalsMode } from './mode-chip'

// The engine offers three modes (tools/approval.py::_normalize_approval_mode)
// and treats `off` as a bypass equivalent to YOLO. The chip used to look for
// 'smart' and call everything else 'manual', so a session running with
// approvals.mode: off displayed "Ask for approval" while the agent never asked.

describe('readApprovalsMode', () => {
  it('reports off rather than collapsing it into manual', () => {
    expect(readApprovalsMode({ approvals: { mode: 'off' } })).toBe('off')
  })

  it('reads the boolean YAML writes for a bare `mode: off`', () => {
    // YAML 1.1 parses `off` as False; the engine maps that back to the 'off'
    // string, so anything it treats as a bypass has to arrive here as 'off'.
    expect(readApprovalsMode({ approvals: { mode: false } })).toBe('off')
  })

  it.each(['smart', 'manual'])('passes %s through', mode => {
    expect(readApprovalsMode({ approvals: { mode } })).toBe(mode)
  })

  it.each([' OFF ', 'Smart'])('normalizes %p the way the engine does', mode => {
    expect(readApprovalsMode({ approvals: { mode } })).toBe(mode.trim().toLowerCase())
  })

  it.each([
    ['an unknown value', { approvals: { mode: 'auto' } }],
    ['a missing mode', { approvals: {} }],
    ['no approvals block', {}],
    ['an approvals list', { approvals: [] }]
  ])('falls back to manual for %s', (_label, config) => {
    expect(readApprovalsMode(config)).toBe('manual')
  })
})
