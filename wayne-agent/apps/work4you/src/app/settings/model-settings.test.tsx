// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { modelLabel } from '@/lib/w4y-featured-models'

import { ModelSettings } from './model-settings'

// Radix Select calls scrollIntoView on its items when the content opens; jsdom
// doesn't implement it (nor hasPointerCapture / releasePointerCapture), so stub
// them to let the dropdown open in tests.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
})

const getGlobalModelInfo = vi.fn()
const getGlobalModelOptions = vi.fn()
const getAuxiliaryModels = vi.fn()
const getMoaModels = vi.fn()
const setModelAssignment = vi.fn()
const getRecommendedDefaultModel = vi.fn()
const saveMoaModels = vi.fn()
const setEnvVar = vi.fn()
const getHermesConfigRecord = vi.fn()
const saveHermesConfig = vi.fn()
const startManualProviderOAuth = vi.fn()

vi.mock('@/hermes', () => ({
  getGlobalModelInfo: () => getGlobalModelInfo(),
  getGlobalModelOptions: () => getGlobalModelOptions(),
  getAuxiliaryModels: () => getAuxiliaryModels(),
  getMoaModels: () => getMoaModels(),
  setModelAssignment: (body: unknown) => setModelAssignment(body),
  getRecommendedDefaultModel: (slug: string) => getRecommendedDefaultModel(slug),
  saveMoaModels: (body: unknown) => saveMoaModels(body),
  setEnvVar: (key: string, value: string) => setEnvVar(key, value),
  getHermesConfigRecord: () => getHermesConfigRecord(),
  saveHermesConfig: (config: unknown) => saveHermesConfig(config),
  setApiRequestProfile: vi.fn()
}))

vi.mock('../hooks/use-config-record', () => ({
  useHermesConfigRecord: () => ({
    data: { agent: { reasoning_effort: 'medium', service_tier: 'normal' } },
    isError: false,
    refetch: vi.fn()
  }),
  setHermesConfigCache: vi.fn(),
  invalidateHermesConfig: vi.fn()
}))

vi.mock('@/store/onboarding', () => ({
  startManualProviderOAuth: (slug: string) => startManualProviderOAuth(slug)
}))

const MOA_CONFIG = {
  default_preset: 'default',
  active_preset: '',
  presets: {
    default: {
      reference_models: [
        { provider: 'openrouter', model: 'openai/gpt-5.5' },
        { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' }
      ],
      aggregator: { provider: 'openrouter', model: 'anthropic/claude-opus-4.8' },
      reference_temperature: null,
      aggregator_temperature: null,
      max_tokens: 4096,
      enabled: true
    }
  },
  enabled: true
}

beforeEach(() => {
  getGlobalModelInfo.mockResolvedValue({ provider: 'nous', model: 'hermes-4' })
  getGlobalModelOptions.mockResolvedValue({
    providers: [
      {
        name: 'OpenRouter',
        slug: 'openrouter',
        models: ['openai/gpt-5.5', 'deepseek/deepseek-v4-pro', 'anthropic/claude-opus-4.8'],
        authenticated: true
      },
      {
        name: 'Nous',
        slug: 'nous',
        models: ['hermes-4'],
        authenticated: true
      }
    ]
  })
  getAuxiliaryModels.mockResolvedValue({
    main: { provider: 'nous', model: 'hermes-4' },
    tasks: [{ task: 'vision', provider: 'auto', model: '', base_url: '' }]
  })
  getMoaModels.mockResolvedValue(MOA_CONFIG)
  setModelAssignment.mockResolvedValue({ provider: 'nous', model: 'hermes-4', gateway_tools: [] })
  getRecommendedDefaultModel.mockResolvedValue({ provider: 'nous', model: 'hermes-4', free_tier: null })
  setEnvVar.mockResolvedValue({ ok: true })
  getHermesConfigRecord.mockResolvedValue({ agent: { reasoning_effort: 'medium', service_tier: 'normal' } })
  saveHermesConfig.mockResolvedValue({ ok: true })
  saveMoaModels.mockResolvedValue({ ok: true, ...MOA_CONFIG })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ModelSettings', () => {
  it('shows executive council in separate sections without preset toolbar', async () => {
    render(<ModelSettings />)

    await waitFor(() => expect(getMoaModels).toHaveBeenCalled())
    expect(screen.getByText(/Executive council · Mixture of Agents/i)).toBeTruthy()
    expect(screen.getByText(/Several models advise in parallel/i)).toBeTruthy()
    expect(screen.getByText('Advisors')).toBeTruthy()
    expect(screen.getAllByText('Chair').length).toBeGreaterThan(0)
    expect(screen.getByText('Advisor 1')).toBeTruthy()
    expect(screen.getByText('Advisor 2')).toBeTruthy()
    expect(screen.queryByText('Set default')).toBeNull()
    expect(screen.queryByText('Add preset')).toBeNull()
    expect(screen.queryByPlaceholderText('new preset')).toBeNull()
    expect(screen.queryByText('OpenRouter')).toBeNull()
    expect(screen.queryByText('Default model')).toBeNull()
  })

  it('only offers catalog model pickers (no provider dropdowns on seats)', async () => {
    render(<ModelSettings />)

    await waitFor(() => expect(getGlobalModelOptions).toHaveBeenCalled())
    // Seats show the configured model through the shared label rule — never the
    // raw catalog id, and never the provider name behind it.
    expect(await screen.findByText(modelLabel('openai/gpt-5.5'))).toBeTruthy()
    expect(screen.getAllByText(modelLabel('deepseek/deepseek-v4-pro')).length).toBeGreaterThan(0)
    // Provider comboboxes for seats are gone — only model values show.
    expect(screen.queryByText('Nous')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add advisor' })).toBeTruthy()
  })

  it('shows an unavailable state when MoA config is missing', async () => {
    getMoaModels.mockResolvedValueOnce(null)

    render(<ModelSettings />)

    expect(await screen.findByText(/not available right now/i)).toBeTruthy()
  })

  it('saves council seats pinned to the catalog provider', async () => {
    render(<ModelSettings />)

    const saveButton = await screen.findByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveMoaModels).toHaveBeenCalled())
    const body = saveMoaModels.mock.calls[0][0] as {
      presets: Record<string, { aggregator: { provider: string }; reference_models: { provider: string }[] }>
    }
    const preset = body.presets.default
    expect(preset.aggregator.provider).toBe('openrouter')
    expect(preset.reference_models.every(slot => slot.provider === 'openrouter')).toBe(true)
  })
})
