// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as HermesApi from '@/hermes'
import { queryClient } from '@/lib/query-client'

import { isProductSkill } from './index'

const getSkills = vi.fn()

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<typeof HermesApi>()),
  getSkills: () => getSkills()
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

function skill(overrides: Record<string, unknown> = {}) {
  return {
    name: 'demo',
    description: 'A skill',
    category: 'general',
    enabled: true,
    usage: 0,
    ...overrides
  }
}

function renderSkills(entry = '/skills') {
  return import('./index').then(({ SkillsView }) =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[entry]}>
          <SkillsView />
        </MemoryRouter>
      </QueryClientProvider>
    )
  )
}

beforeEach(() => {
  getSkills.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  queryClient.clear()
})

describe('isProductSkill', () => {
  it('keeps learned and hub skills, drops bundled kit', () => {
    expect(isProductSkill(skill({ provenance: 'agent' }))).toBe(true)
    expect(isProductSkill(skill({ provenance: 'hub' }))).toBe(true)
    expect(isProductSkill(skill({ provenance: 'bundled' }))).toBe(false)
    expect(isProductSkill(skill({}))).toBe(false)
  })
})

describe('SkillsView product face', () => {
  it('lists only learned and hub skills, without enable toggles', async () => {
    getSkills.mockResolvedValue([
      skill({ name: 'gmail-composio', provenance: 'agent', category: 'productivity' }),
      skill({ name: 'agentmail', provenance: 'hub', category: 'general' }),
      skill({ name: 'arxiv', provenance: 'bundled', category: 'research' })
    ])

    await renderSkills()

    await screen.findByText('gmail-composio')
    expect(screen.getAllByText('agentmail').length).toBeGreaterThan(0)
    expect(screen.queryByText('arxiv')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('exposes Skills, Connectors, and Browse Hub — not Tools or MCP', async () => {
    await renderSkills()

    await waitFor(() => expect(screen.getAllByText('Skills').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Connectors').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Browse Hub').length).toBeGreaterThan(0)
    expect(screen.queryByText('Tools')).toBeNull()
    expect(screen.queryByText('MCP')).toBeNull()
  })

  it('coerces legacy ?tab=toolsets and ?tab=mcp to the Skills tab', async () => {
    getSkills.mockResolvedValue([skill({ name: 'learned-one', provenance: 'agent' })])

    await renderSkills('/skills?tab=toolsets')
    await screen.findAllByText('learned-one')
    expect(screen.queryByRole('switch')).toBeNull()

    cleanup()
    queryClient.clear()

    await renderSkills('/skills?tab=mcp')
    await screen.findAllByText('learned-one')
  })

  it('shows empty state pointing at Browse Hub when there are no product skills', async () => {
    getSkills.mockResolvedValue([skill({ name: 'arxiv', provenance: 'bundled' })])

    await renderSkills()

    await screen.findByText('No project skills yet')
    // Tab label + empty-state CTA both say Browse Hub.
    expect(screen.getAllByRole('button', { name: 'Browse Hub' }).length).toBeGreaterThan(0)
  })
})
