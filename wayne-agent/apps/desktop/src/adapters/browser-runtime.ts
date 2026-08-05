import type { ProductRuntime } from './types'

function resolvePlatformOrigin(): string {
  if (typeof window === 'undefined') {
    return 'https://work4you.ai'
  }
  const env = import.meta.env.VITE_PLATFORM_ORIGIN
  if (typeof env === 'string' && env.trim()) {
    return env.replace(/\/$/, '')
  }
  // Tenant Fly serves the SPA; billing/login stay on the public site.
  return 'https://work4you.ai'
}

export function createBrowserRuntime(): ProductRuntime {
  return {
    shell: 'browser',
    capabilities: {
      localTerminal: false,
      localGit: false,
      localFs: false,
      gcsUpdate: false,
      cloudBridge: true,
      remoteTerminal: true
    },
    platformOrigin: resolvePlatformOrigin()
  }
}
