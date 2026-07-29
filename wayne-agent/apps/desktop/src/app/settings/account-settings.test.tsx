// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchAccountPlan = vi.fn()
const fetchAccountUsageMeter = vi.fn()
const openUpgrade = vi.fn()
const openBillingPortal = vi.fn()
const openPlans = vi.fn()
const saveSpendLimit = vi.fn()
const gatewayAtom = atom<{ connectionState: string; request: ReturnType<typeof vi.fn> } | null>(null)

vi.mock('@/lib/plans', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plans')>('@/lib/plans')
  return {
    ...actual,
    fetchAccountPlan: () => fetchAccountPlan(),
    fetchAccountUsageMeter: (...args: unknown[]) => fetchAccountUsageMeter(...args),
    openUpgrade: (...args: unknown[]) => openUpgrade(...args),
    openBillingPortal: () => openBillingPortal(),
    openPlans: (...args: unknown[]) => openPlans(...args),
    saveSpendLimit: (...args: unknown[]) => saveSpendLimit(...args)
  }
})

vi.mock('@/store/gateway', () => ({
  $gateway: gatewayAtom
}))

const proPlan = {
  hasCustomer: true,
  includedUsd: 40,
  plan: 'pro',
  status: 'active',
  ondemand: {
    enabled: false,
    spendLimitUsd: 0,
    maxSpendLimitUsd: 50,
    usedUsd: 0,
    includedUsedUsd: 12,
    includedUsd: 40,
    metered: true,
    billedOn: 'next_invoice' as const
  }
}

beforeEach(() => {
  fetchAccountPlan.mockResolvedValue(proPlan)
  saveSpendLimit.mockResolvedValue({
    ...proPlan,
    ondemand: { ...proPlan.ondemand, enabled: true, spendLimitUsd: 10 }
  })
  fetchAccountUsageMeter.mockResolvedValue({
    configured: true,
    depleted: false,
    usedPercent: 42.4
  })
  gatewayAtom.set({
    connectionState: 'open',
    request: vi.fn()
  })
  window.work4youDesktop = {
    cloud: {
      api: vi.fn(async () => ({
        ok: true,
        json: { display_name: 'Leo', email: 'leo@work4you.ai', user_id: 'u1' }
      }))
    }
  } as never
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete (window as { work4youDesktop?: unknown }).work4youDesktop
})

describe('AccountSettings wired', () => {
  it('shows live plan chip, included %, and opens Stripe portal when managing', async () => {
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)

    expect(await screen.findByText('Pro')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('42% used')).toBeTruthy())
    expect(screen.getByText('Leo')).toBeTruthy()
    expect(screen.getAllByText('leo@work4you.ai').length).toBeGreaterThan(0)
    expect(screen.getByText('Off')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))
    expect(openUpgrade).toHaveBeenCalledWith('pro')

    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }))
    expect(openBillingPortal).toHaveBeenCalled()
  })

  it('falls back to Plans when there is no Stripe customer', async () => {
    fetchAccountPlan.mockResolvedValueOnce({
      hasCustomer: false,
      includedUsd: 0,
      plan: 'free',
      status: 'inactive',
      ondemand: {
        enabled: false,
        spendLimitUsd: 0,
        maxSpendLimitUsd: 0,
        usedUsd: null,
        includedUsedUsd: null,
        includedUsd: 0,
        metered: false,
        billedOn: 'ceiling_only' as const
      }
    })
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)

    expect(await screen.findByText('Hobby')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Manage subscription' }))
    expect(openPlans).toHaveBeenCalled()
    expect(openBillingPortal).not.toHaveBeenCalled()
  })

  it('enables on-demand and saves spend limit', async () => {
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)

    expect(await screen.findByText('Pro')).toBeTruthy()
    const switchEl = screen.getByRole('switch')
    fireEvent.click(switchEl)

    await waitFor(() =>
      expect(saveSpendLimit).toHaveBeenCalledWith({ enabled: true, spendLimitUsd: 10 })
    )

    expect(await screen.findByText('Spend limit')).toBeTruthy()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(saveSpendLimit).toHaveBeenCalledWith({ enabled: true, spendLimitUsd: 25 })
    )
  })
})
