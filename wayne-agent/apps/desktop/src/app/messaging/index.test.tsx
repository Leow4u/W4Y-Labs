// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type * as HermesApi from '@/hermes'
import type { MessagingPlatformInfo } from '@/types/hermes'

import { MessagingView } from './index'

const getMessagingPlatforms = vi.fn()
const updateMessagingPlatform = vi.fn()
const testMessagingPlatform = vi.fn()
const openExternalLink = vi.fn()

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<typeof HermesApi>()),
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
  vi.clearAllMocks()
})

function renderMessaging(route = '/messaging?platform=teams&view=setup') {
  return render(
    <I18nProvider configClient={null}>
      <MemoryRouter initialEntries={[route]}>
        <MessagingView />
      </MemoryRouter>
    </I18nProvider>
  )
}

describe('MessagingView setup-guide link', () => {
  it('opens a real docs URL through the validated external opener', async () => {
    const docsUrl = 'https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams'
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: docsUrl })] })

    renderMessaging()

    const link = await screen.findByRole('link', { name: /Open setup guide/i })
    fireEvent.click(link)

    await waitFor(() => expect(openExternalLink).toHaveBeenCalledWith(docsUrl))
  })

  it('hides the setup-guide button for a plugin platform with no docs URL', async () => {
    getMessagingPlatforms.mockResolvedValue({ platforms: [platform({ docs_url: '' })] })

    renderMessaging()

    await screen.findByRole('heading', { name: /Microsoft Teams/i })
    expect(screen.queryByRole('link', { name: /Open setup guide/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Work4You documentation/i })).toBeNull()
  })
})
