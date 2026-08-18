import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { HermesConnection } from '@/global'
import { $accountGate } from '@/store/account-gate'
import { $desktopBoot } from '@/store/boot'
import { $desktopOnboarding } from '@/store/onboarding'
import { $connection, setConnection, setGatewayState } from '@/store/session'

import { BootFailureOverlay } from './boot-failure-overlay'
import { GatewayConnectingOverlay } from './gateway-connecting-overlay'

// Repro for the "remote gateway → stuck on CONNECTING, no way to settings"
// report. The connecting overlay (z-1200, full-screen, pointer-events on) used
// to be shown whenever `gatewayState !== 'open' && !boot.error`. The ONLY escape
// hatch — BootFailureOverlay, which has "Use local gateway" / "Sign in" /
// "Retry" — only renders when `boot.error` is set.
//
// useGatewayBoot only calls failDesktopBoot() (which sets boot.error) when the
// INITIAL boot() throws. After the first successful connect (bootCompleted),
// any later socket drop goes through scheduleReconnect(), which loops FOREVER
// against the dead remote. So gatewayState sits at 'closed'/'error' with
// boot.error null. The fix keeps the initial-boot overlay out of post-boot
// reconnects, leaving chat/settings usable while the reconnect loop runs.

function cloudBodyConnection(): HermesConnection {
  return {
    baseUrl: 'https://wayne-example.fly.dev',
    isFullscreen: false,
    mode: 'cloud-body',
    nativeOverlayWidth: 0,
    source: 'cloud-body',
    token: '',
    wsUrl: 'wss://wayne-example.fly.dev/api/ws',
    logs: [],
    windowButtonPosition: null
  }
}

function resetStores() {
  setGatewayState('idle')
  $accountGate.set({ phase: 'idle', error: null })
  setConnection(null)
  $desktopBoot.set({
    error: null,
    fakeMode: false,
    message: 'ready',
    phase: 'renderer.ready',
    progress: 100,
    running: false,
    timestamp: Date.now(),
    visible: false
  })
  $desktopOnboarding.set({
    configured: true,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  })
}

beforeEach(resetStores)
afterEach(cleanup)

// The connecting overlay renders an icon + status label; query by the
// data-testid on the label so the recovery overlay's copy isn't a false positive.
const isConnectingShown = () => Boolean(screen.queryByTestId('connecting-label'))

const isRecoveryShown = () =>
  Boolean(screen.queryByText(/use local gateway/i) || screen.queryByText(/retry/i) || screen.queryByText(/sign in/i))

describe('connecting overlay vs recovery surface', () => {
  it('hard initial-boot failure surfaces the recovery overlay (the working path)', () => {
    // failDesktopBoot() ran: error set, gateway never opened.
    $desktopBoot.set({
      ...$desktopBoot.get(),
      error: 'Work4You engine did not become ready',
      running: false,
      visible: true
    })
    setGatewayState('error')

    render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    expect(isRecoveryShown()).toBe(true)
    // Connecting overlay bows out when boot.error is set.
    expect(isConnectingShown()).toBe(false)
  })

  it('post-boot socket drops do not re-cover the app with the initial CONNECTING overlay', () => {
    // 1. Initial boot succeeded: gateway opened, boot completed (no error).
    setGatewayState('open')

    const { rerender } = render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    expect(isConnectingShown()).toBe(false)

    // 2. The remote VPS socket drops (sleep/wake, remote restart, network).
    //    bootCompleted is true, so useGatewayBoot routes this through
    //    scheduleReconnect() — boot.error stays NULL.
    setGatewayState('closed')
    rerender(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    // The initial-boot connecting overlay stays out of the way, so settings and
    // the composer remain reachable during the reconnect loop.
    expect(isConnectingShown()).toBe(false)
    expect(isRecoveryShown()).toBe(false)

    // 3. Reconnect loops against the dead remote: gatewayState bounces closed
    //    → error → closed. Until the escalation path sets boot.error, the app
    //    remains usable instead of modal-blocked.
    setGatewayState('error')
    rerender(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )
    expect($desktopBoot.get().error).toBeNull()
    expect(isConnectingShown()).toBe(false)
    expect(isRecoveryShown()).toBe(false)
  })

  it('FIX: once the prolonged reconnect raises a recoverable boot error, the recovery overlay takes over', () => {
    // Mirrors what useGatewayBoot.scheduleReconnect() now does after ~45s of
    // failed post-boot reconnects: it calls failDesktopBoot(), flipping the UI
    // from the dead-end CONNECTING overlay to the recovery surface.
    setGatewayState('error')
    $desktopBoot.set({
      ...$desktopBoot.get(),
      error: 'Lost connection to the Hermes gateway and could not reconnect.',
      running: false,
      visible: true
    })

    render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    // Escape hatch is now reachable; the connecting overlay bows out.
    expect(isRecoveryShown()).toBe(true)
    expect(screen.getByText(/use local gateway/i)).toBeTruthy()
    expect(isConnectingShown()).toBe(false)
  })

  it('hides the recovery overlay while the account gate owns first-run', () => {
    $accountGate.set({ phase: 'required', error: null })
    $desktopBoot.set({
      ...$desktopBoot.get(),
      error: 'Work4You engine did not become ready',
      running: false,
      visible: true
    })
    setGatewayState('error')

    render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    expect(isRecoveryShown()).toBe(false)
    expect(isConnectingShown()).toBe(false)
  })

  it('cloud-body recovery keeps Retry and logs, hides Repair / Use local gateway', () => {
    setConnection(cloudBodyConnection())
    $desktopBoot.set({
      ...$desktopBoot.get(),
      error: 'Lost connection to the agent',
      running: false,
      visible: true
    })
    setGatewayState('error')

    render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    expect(screen.getByText(/retry/i)).toBeTruthy()
    expect(screen.getByText(/open logs/i)).toBeTruthy()
    expect(screen.queryByText(/repair install/i)).toBeNull()
    expect(screen.queryByText(/use local gateway/i)).toBeNull()
    expect($connection.get()?.mode).toBe('cloud-body')
  })
})
