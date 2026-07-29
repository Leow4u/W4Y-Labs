// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { featuredDefaultOnIds, resolveFeaturedModels, W4Y_FEATURED_MODELS } from '@/lib/w4y-featured-models'

const getGlobalModelOptions = vi.fn()
const getEnvVars = vi.fn()
const getMoaModels = vi.fn()
const getGlobalModelInfo = vi.fn()
const getAuxiliaryModels = vi.fn()

vi.mock('@/hermes', () => ({
  getGlobalModelOptions: () => getGlobalModelOptions(),
  getEnvVars: () => getEnvVars(),
  getMoaModels: () => getMoaModels(),
  getGlobalModelInfo: () => getGlobalModelInfo(),
  getAuxiliaryModels: () => getAuxiliaryModels(),
  getHermesConfigSchema: vi.fn().mockResolvedValue({ fields: {} }),
  setModelAssignment: vi.fn(),
  getRecommendedDefaultModel: vi.fn(),
  saveMoaModels: vi.fn(),
  setEnvVar: vi.fn(),
  getHermesConfigRecord: vi.fn(),
  saveHermesConfig: vi.fn(),
  setApiRequestProfile: vi.fn()
}))

const CONFIG_RECORD = { agent: { reasoning_effort: 'medium', service_tier: 'normal' } }

vi.mock('../hooks/use-config-record', () => ({
  useHermesConfigRecord: () => ({
    data: CONFIG_RECORD,
    isError: false,
    refetch: vi.fn()
  }),
  peekHermesConfig: () => CONFIG_RECORD,
  setHermesConfigCache: vi.fn(),
  invalidateHermesConfig: vi.fn()
}))

vi.mock('@/store/onboarding', () => ({
  startManualProviderOAuth: vi.fn()
}))

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useLocation: () => ({ hash: '', pathname: '/settings', search: '?tab=config:model' }),
    useNavigate: () => navigate
  }
})

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const CATALOG_IDS = W4Y_FEATURED_MODELS.map(m => m.id)

beforeEach(() => {
  navigate.mockReset()
  getEnvVars.mockResolvedValue({})
  getGlobalModelInfo.mockResolvedValue({ provider: 'openrouter', model: 'anthropic/claude-opus-5' })
  getAuxiliaryModels.mockResolvedValue({
    main: { provider: 'openrouter', model: 'anthropic/claude-opus-5' },
    tasks: []
  })
  getMoaModels.mockResolvedValue({
    default_preset: 'default',
    active_preset: '',
    presets: {
      default: {
        reference_models: [{ provider: 'openrouter', model: 'openai/gpt-5.6-sol' }],
        aggregator: { provider: 'openrouter', model: 'anthropic/claude-opus-5' },
        enabled: true
      }
    },
    enabled: true
  })
  getGlobalModelOptions.mockResolvedValue({
    providers: [
      {
        name: 'Catalog',
        slug: 'openrouter',
        authenticated: true,
        models: CATALOG_IDS
      }
    ]
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('resolveFeaturedModels', () => {
  it('keeps only catalog-present pinned models', () => {
    const available = new Set(['anthropic/claude-opus-5', 'openai/gpt-5.6-sol', 'unknown/model'])
    const primary = resolveFeaturedModels(available, { primaryOnly: true })
    expect(primary.every(m => available.has(m.id))).toBe(true)
    expect(primary.some(m => m.id === 'anthropic/claude-opus-5')).toBe(true)
    expect(W4Y_FEATURED_MODELS.length).toBeGreaterThan(primary.length)
  })

  it('defaultOn set matches the PME first-run picker', () => {
    expect(featuredDefaultOnIds()).toEqual([
      'x-ai/grok-4.5',
      'anthropic/claude-opus-5',
      'openai/gpt-5.6-sol',
      'anthropic/claude-fable-5',
      'anthropic/claude-sonnet-5',
      'openai/gpt-5.6-terra',
      'anthropic/claude-sonnet-4.6'
    ])
  })
})

describe('ModelsSettings', () => {
  it('renders curated toggles and disclosures without OpenRouter branding', async () => {
    const { ModelsSettings } = await import('./models-settings')
    renderWithProviders(<ModelsSettings />)

    expect(await screen.findByText('Opus 5')).toBeTruthy()
    expect(screen.getByText('Grok 4.5')).toBeTruthy()
    expect(screen.getByText('Fable 5')).toBeTruthy()
    expect(screen.getByText('Sonnet 4.6')).toBeTruthy()
    expect(screen.getByText('Codex 5.3')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Models' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/appear in the chat picker/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /API Keys/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Executive council/i })).toBeTruthy()
    expect(screen.queryByText('OpenRouter')).toBeNull()
  })

  it('expands More… on the same screen', async () => {
    const { ModelsSettings } = await import('./models-settings')
    renderWithProviders(<ModelsSettings />)

    expect(await screen.findByText('Opus 5')).toBeTruthy()
    expect(screen.queryByText('Opus 4.7')).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'More…' }))
    expect(await screen.findByText('Opus 4.7')).toBeTruthy()
    expect(screen.getByText('Gemini 3.6 Flash')).toBeTruthy()
    expect(screen.getByText('Kimi K2.7 Code')).toBeTruthy()
  })

  it('opens the full catalog page from + Add more LLM', async () => {
    const { ModelsSettings } = await import('./models-settings')
    renderWithProviders(<ModelsSettings />)

    fireEvent.click(await screen.findByRole('button', { name: '+ Add more LLM' }))
    expect(navigate).toHaveBeenCalled()
    const arg = navigate.mock.calls.at(-1)?.[0] as { search?: string }
    expect(arg?.search || '').toContain('msection=catalog')
  })
})
