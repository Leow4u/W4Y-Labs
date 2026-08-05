/** Which shell runs the shared product UI bundle. */
export type AppShell = 'electron' | 'browser'

export interface ProductCapabilities {
  /** Local PTY in the right sidebar (Electron only). */
  localTerminal: boolean
  /** Git IPC / review panel against local repo. */
  localGit: boolean
  /** Read/write project files via Electron IPC. */
  localFs: boolean
  /** GCS casca + engine update chip. */
  gcsUpdate: boolean
  /** Work4You cloud bridge (SSO, tenant WS). */
  cloudBridge: boolean
  /** Remote PTY on the cloud VM (browser + cloud desktop). */
  remoteTerminal: boolean
}

export interface ProductRuntime {
  shell: AppShell
  capabilities: ProductCapabilities
  /** Platform origin for login/billing (work4you.ai). */
  platformOrigin: string
}
