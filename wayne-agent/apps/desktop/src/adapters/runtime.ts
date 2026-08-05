import { createBrowserRuntime } from './browser-runtime'
import { createElectronRuntime } from './electron-runtime'
import type { AppShell, ProductRuntime } from './types'

export function detectAppShell(): AppShell {
  if (import.meta.env.VITE_APP_SHELL === 'browser') {
    return 'browser'
  }
  if (typeof window !== 'undefined' && window.hermesDesktop) {
    return 'electron'
  }
  return 'browser'
}

export function createProductRuntime(): ProductRuntime {
  return detectAppShell() === 'electron' ? createElectronRuntime() : createBrowserRuntime()
}

let cached: ProductRuntime | null = null

/** Singleton runtime for the current page load. */
export function getProductRuntime(): ProductRuntime {
  if (!cached) {
    cached = createProductRuntime()
  }
  return cached
}
