/**
 * Work4You connection target — brain (Fly) + body (Electron) helpers.
 *
 * Packaged desktop: brain on tenant Fly, body on the user's PC.
 * Legacy `mode: 'cloud-body'` is kept for one release; prefer `brain: 'fly'`.
 */
import type { HermesConnection } from '@/global'

export type BrainKind = 'fly' | 'local' | 'remote'
export type BodyKind = 'electron' | 'none'

export interface ConnectionTarget {
  authMode: 'cloud' | 'local' | 'remote'
  body: BodyKind
  brain: BrainKind
  /** Legacy HermesConnection.mode */
  mode: HermesConnection['mode']
  source: HermesConnection['source']
}

/** True when the gateway socket should mint tenant WS tickets (not local Python). */
export function isFlyBrainConnection(
  connection: HermesConnection | null | undefined
): boolean {
  if (!connection) {
    return false
  }

  const brain = (connection as HermesConnection & { brain?: BrainKind }).brain
  if (brain === 'fly') {
    return true
  }

  return connection.mode === 'cloud-body'
}

/** Packaged Fly-primary: one socket, no local backend process. */
export function isPackagedFlyPrimary(connection: HermesConnection | null | undefined): boolean {
  return isFlyBrainConnection(connection)
}
