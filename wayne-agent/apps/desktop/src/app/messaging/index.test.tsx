// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MessagingPlatformInfo } from '@/types/hermes'

const getMessagingPlatforms = vi.fn()
const updateMessagingPlatform = vi.fn()
const testMessagingPlatform = vi.fn()
const openExternalLink = vi.fn()

vi.mock('@/hermes', () => ({
  getMessagingPlatforms: (...args: unknown[]) => getMessagingPlatforms(...args),
  updateMessagingPlatform: (id: string, body: unknown) => updateMessagingPlatform(id, body),
  testMessagingPlatform: (id: string) => testMessagingPlatform(id)
}))

vi.mock('@/lib/external-link', () => ({
  openExternalLink: (href: string) => openExternalLink(href)
}))

vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

vi.mock('@/store/system-actions', () => ({
  runGatewayRestart: vi.fn()
}))

vi.mock('@nanostores/react', () => ({
  useStore: () => []
}))

function platform(patch: Partial<MessagingPlatformInfo> = {}): MessagingPlatformInfo {
  return {
    configured: false,
    description: 'A platform.',
    docs_url: '',
    enabled: false,
    env_vars: [],
    gateway_running: true,
    id: 'teams',
    name: 'Microsoft Teams',
    state: 'disabled',
    ...patch
  }
}

beforeEach(() => {
  getMessagingPlatforms.mockReset()
  updateMessagingPlatform.mockReset()
  testMessagingPlatform.mockReset()
  openExternalLink.mockReset()
  updateMessagingPlatform.mockResolvedValue({ ok: true, platform: 'teams' })
  testMessagingPlatform.mockResolvedValue({ ok: true, message: 'ok' })
})

afterEach(() => {
  cleanup()
})

async function renderMessaging(route = '/messaging?platform=teams&view=setup') {
  const { MessagingView } = await import('./index')

  return render(
    <MemoryRouter initialEntries={[route]}>
      <MessagingView />
    </MemoryRouter>
  )
}

describe('MessagingView setup-guide link', () => {
  it('opens a real docs URL through the validated external opener', async () => {
    const docsUrl = 'https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams'
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: docsUrl })] })

    await renderMessaging()

    const link = await screen.findByText('Open setup guide')
    fireEvent.click(link)

    await waitFor(() => expect(openExternalLink).toHaveBeenCalledWith(docsUrl))
  })

  it('hides the setup-guide button for a plugin platform with no docs URL', async () => {
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: '' })] })

    const { container } = await renderMessaging()

    await waitFor(() => {
      expect(getMessagingPlatforms).toHaveBeenCalled()
      expect(container.textContent ?? '').toMatch(/Teams/i)
    })
    expect(screen.queryByText('Open setup guide')).toBeNull()
    expect(screen.queryByText('Work4You documentation')).toBeNull()
  })
})
