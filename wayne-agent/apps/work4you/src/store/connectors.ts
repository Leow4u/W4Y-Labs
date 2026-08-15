/**
 * Shared connectors UI bus — ConnectLinkCard / disconnect-all bump this so the
 * composer chip and Conectores tab reload ACTIVE accounts without a remount.
 */
import { atom } from 'nanostores'

/** Monotonic revision; subscribers refetch status when it changes. */
export const $connectorsRevision = atom(0)

/** Slug of the toolkit that most recently became ACTIVE (composer chip priority). */
export const $lastConnectedToolkit = atom<string | null>(null)

export function notifyConnectorsChanged(toolkit?: string | null): void {
  if (toolkit) {
    $lastConnectedToolkit.set(toolkit.toLowerCase())
  }
  $connectorsRevision.set($connectorsRevision.get() + 1)
}
