import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, findByText, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { rememberComposerManualModel } from '@/lib/composer-auto-mode'
import { $activeSessionId, $currentModel, $currentProvider } from '@/store/session'

import { ModelMenuPanel } from './model-menu-panel'

// Radix calls these on open; jsdom doesn't implement them.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
})

const getGlobalModelOptions = vi.fn()

vi.mock('@/hermes', () => ({
  getGlobalModelOptions: (...args: unknown[]) => getGlobalModelOptions(...args)
}))

vi.mock('@/hooks/use-account-plan-gating', () => ({
  useAccountPlanGating: () => ({
    accountPlan: { data: null },
    plan: 'starter',
    gratisGating: false,
    isLocked: () => false
  })
}))

// MoA presets now arrive as the catalog's virtual `moa` provider row (the same
// payload a remote gateway's model.options returns), not the /api/model/moa
// REST config.
const MOA_PROVIDER = { models: ['default', 'BeastMode'], name: 'Mixture of Agents', slug: 'moa' }
const CATALOG_PROVIDER = {
  models: ['openrouter/auto', 'x-ai/grok-4.5', 'anthropic/claude-sonnet-5'],
  name: 'Catalog',
  slug: 'openrouter'
}

beforeEach(() => {
  $activeSessionId.set('runtime-1')
  $currentModel.set('')
  $currentProvider.set('')
  localStorage.clear()
  getGlobalModelOptions.mockResolvedValue({ providers: [CATALOG_PROVIDER, MOA_PROVIDER] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(onSelectModel = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DropdownMenu open>
          <DropdownMenuContent>
            <ModelMenuPanel onSelectModel={onSelectModel} requestGateway={vi.fn() as never} />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>
    </MemoryRouter>
  )

  return onSelectModel
}

describe('ModelMenuPanel Auto toggle', () => {
  it('renders Auto as a switch, not a checkmark model row', async () => {
    renderPanel()

    const autoSwitch = await screen.findByRole('switch', { name: 'Auto' })
    expect(autoSwitch).toBeTruthy()
    expect(autoSwitch.getAttribute('data-state')).toBe('unchecked')

    // Hint only appears when Auto is ON — OFF shows label + switch only.
    expect(document.body.textContent).not.toContain('Balanced quality and speed')

    // Specific-model section — never the old "Switch to specific model" framing
    // that treated Auto as the selected ✓ row.
    expect(document.body.textContent).toContain('Specific model')
    expect(document.body.textContent).not.toContain('Switch to specific model')
  })

  it('turning Auto on selects openrouter/auto', async () => {
    const onSelectModel = renderPanel()

    const autoSwitch = await screen.findByRole('switch', { name: 'Auto' })
    fireEvent.click(autoSwitch)

    expect(onSelectModel).toHaveBeenCalledWith({ model: 'openrouter/auto', provider: 'openrouter' })
  })

  it('turning Auto off restores the last manual model', async () => {
    $currentModel.set('openrouter/auto')
    $currentProvider.set('openrouter')
    rememberComposerManualModel('x-ai/grok-4.5', 'openrouter')

    const onSelectModel = renderPanel()

    const autoSwitch = await screen.findByRole('switch', { name: 'Auto' })
    expect(autoSwitch.getAttribute('data-state')).toBe('checked')
    fireEvent.click(autoSwitch)

    expect(onSelectModel).toHaveBeenCalledWith({ model: 'x-ai/grok-4.5', provider: 'openrouter' })
  })

  it('never lists openrouter/auto under specific models with a check', async () => {
    $currentModel.set('openrouter/auto')
    $currentProvider.set('openrouter')
    renderPanel()

    await screen.findByRole('switch', { name: 'Auto' })
    const checks = document.body.querySelectorAll('.codicon-check')
    for (const check of checks) {
      const row = check.closest('[role="menuitem"]')
      expect(row?.textContent ?? '').not.toMatch(/^Auto\b/)
    }
  })

  it('when Auto is ON hides specific models, MoA, and the specific-model label', async () => {
    $currentModel.set('openrouter/auto')
    $currentProvider.set('openrouter')
    renderPanel()

    await screen.findByRole('switch', { name: 'Auto' })

    expect(document.body.textContent).toContain('Balanced quality and speed')
    expect(document.body.textContent).toContain('Add models')
    expect(document.body.textContent).not.toContain('Specific model')
    expect(document.body.textContent).not.toContain('MoA presets')
    expect(document.body.textContent).not.toContain('Grok')
    expect(document.body.textContent).not.toContain('Claude')
  })

  it('when Auto is OFF shows specific models and MoA again', async () => {
    renderPanel()

    await screen.findByRole('switch', { name: 'Auto' })
    expect(document.body.textContent).toContain('Specific model')
    expect(document.body.textContent).toContain('MoA presets')
    expect(await findByText(document.body, 'MoA: BeastMode')).toBeTruthy()
  })
})

describe('ModelMenuPanel MoA presets', () => {
  it('selecting a MoA preset switches PERSISTENTLY via onSelectModel (not the one-shot dispatch)', async () => {
    const onSelectModel = renderPanel()

    // moaOptions is async (useQuery) — wait for the preset row to mount.
    const row = await findByText(document.body, 'MoA: BeastMode')
    fireEvent.click(row)

    // #54670: must route through the persistent model-switch path
    // (config.set model="<preset> --provider moa"), i.e. onSelectModel with
    // provider 'moa', NOT a one-shot command.dispatch that reverts after a turn.
    expect(onSelectModel).toHaveBeenCalledWith({ model: 'BeastMode', provider: 'moa' })
  })

  it('shows the check on the preset that matches the current moa selection', async () => {
    $currentProvider.set('moa')
    $currentModel.set('BeastMode')
    renderPanel()

    const row = await findByText(document.body, 'MoA: BeastMode')
    // The check codicon renders as a sibling within the same row item.
    const item = row.closest('[role="menuitem"]') ?? row.parentElement
    expect(item?.querySelector('.codicon-check')).not.toBeNull()
  })

  it('keeps the virtual moa provider out of the main model groups (presets section only)', async () => {
    renderPanel()

    await findByText(document.body, 'MoA: BeastMode')

    // The provider group header would read "Mixture of Agents"; the presets
    // section header reads "MoA presets". Only the latter should exist.
    expect(document.body.textContent).toContain('MoA presets')
    expect(document.body.textContent).not.toContain('Mixture of Agents')
  })

  it('renders presets from the catalog even before a session exists', async () => {
    $activeSessionId.set('')
    const onSelectModel = renderPanel()

    const row = await findByText(document.body, 'MoA: BeastMode')
    fireEvent.click(row)

    // Pre-session picks are UI state shipped on the next session.create — the
    // row must not be disabled and must still route through onSelectModel.
    expect(onSelectModel).toHaveBeenCalledWith({ model: 'BeastMode', provider: 'moa' })
  })
})
