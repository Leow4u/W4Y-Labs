import type { ProductRuntime } from './types'

export function createElectronRuntime(): ProductRuntime {
  return {
    shell: 'electron',
    capabilities: {
      localTerminal: Boolean(window.hermesDesktop?.terminal),
      localGit: Boolean(window.hermesDesktop?.git),
      localFs: Boolean(window.hermesDesktop),
      gcsUpdate: true,
      cloudBridge: Boolean(window.work4youDesktop?.cloud),
      remoteTerminal: Boolean(window.work4youDesktop?.cloud)
    },
    platformOrigin: 'https://work4you.ai'
  }
}
