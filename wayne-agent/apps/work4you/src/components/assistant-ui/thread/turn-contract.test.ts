import { describe, expect, it } from 'vitest'

import {
  buildTurnDelivery,
  buildTurnFileHeroes,
  turnContractKey,
  turnLayoutModeFromKey,
  turnRunningFromKey
} from '@/components/assistant-ui/thread/turn-contract'

describe('turnContractKey', () => {
  it('marks ask mode when no tool calls exist in the turn', () => {
    const messages = [
      { id: 'u1', role: 'user', content: [{ text: 'hi', type: 'text' }] },
      { id: 'a1', role: 'assistant', content: [{ text: 'hello', type: 'text' }], status: { type: 'complete' } }
    ]

    const key = turnContractKey(messages, [0, 1], false)

    expect(turnLayoutModeFromKey(key)).toBe('ask')
    expect(turnRunningFromKey(key)).toBe(false)
  })

  it('marks agent mode when any assistant tool call exists', () => {
    const messages = [
      { id: 'u1', role: 'user', content: [{ text: 'run', type: 'text' }] },
      {
        id: 'a1',
        role: 'assistant',
        content: [
          {
            args: {},
            result: { stdout: 'ok' },
            toolCallId: 'tc-1',
            toolName: 'terminal',
            type: 'tool-call'
          }
        ],
        status: { type: 'complete' }
      }
    ]

    const key = turnContractKey(messages, [0, 1], false)

    expect(turnLayoutModeFromKey(key)).toBe('agent')
  })

  it('aggregates file edits across assistant messages in one turn', () => {
    const diff = ['--- a/foo.ts', '+++ b/foo.ts', '@@', '-old', '+new'].join('\n')
    const messages = [
      { id: 'u1', role: 'user', content: [{ text: 'patch', type: 'text' }] },
      {
        id: 'a1',
        role: 'assistant',
        content: [
          {
            args: { path: 'src/foo.ts' },
            result: { diff },
            toolCallId: 'tc-1',
            toolName: 'patch',
            type: 'tool-call'
          }
        ],
        status: { type: 'complete' }
      }
    ]

    const delivery = buildTurnDelivery(messages, [0, 1], {})
    const heroes = buildTurnFileHeroes(messages, [0, 1], {})

    expect(delivery.files).toBe(1)
    expect(delivery.added).toBe(1)
    expect(delivery.removed).toBe(1)
    expect(heroes).toHaveLength(1)
    expect(heroes[0]?.basename).toBe('foo.ts')
    expect(heroes[0]?.disclosureId).toContain('a1')
  })
})
