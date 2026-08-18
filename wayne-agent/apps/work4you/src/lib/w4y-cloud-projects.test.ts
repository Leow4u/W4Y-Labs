import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CLOUD_NOT_LOGGED_IN,
  cloudProjectCwd,
  cwdForCloudSession,
  desktopCwdForSession,
  isLocalMachinePath,
  isPcFolderPath,
  prettifyProject,
  repoNameFromUrl,
  slugifyProject
} from './w4y-cloud-projects'

describe('slugifyProject / prettifyProject', () => {
  it('slugifies accented names', () => {
    expect(slugifyProject('Cliente Itaú')).toBe('cliente-itau')
  })

  it('prettifies slugs for display', () => {
    expect(prettifyProject('cliente-itau')).toBe('Cliente Itau')
  })
})

describe('cloud cwd contract', () => {
  it('builds projects/<slug> under /opt/data', () => {
    expect(cloudProjectCwd('acme')).toBe('/opt/data/projects/acme')
  })

  it('detects Windows and UNC paths', () => {
    expect(isLocalMachinePath('C:\\Users\\x\\repo')).toBe(true)
    expect(isLocalMachinePath('\\\\server\\share')).toBe(true)
    expect(isLocalMachinePath('/opt/data/projects/x')).toBe(false)
  })

  it('strips PC paths for cloud session.create cwd', () => {
    expect(cwdForCloudSession('C:\\Users\\x\\repo')).toBe('')
    expect(cwdForCloudSession('/opt/data/projects/acme')).toBe('/opt/data/projects/acme')
    expect(cwdForCloudSession('')).toBe('')
  })

  it('ships PC folders as desktop_cwd', () => {
    expect(isPcFolderPath('C:\\Users\\x\\repo')).toBe(true)
    expect(isPcFolderPath('/Users/x/proj')).toBe(true)
    expect(isPcFolderPath('/opt/data/projects/acme')).toBe(false)
    expect(desktopCwdForSession('C:\\Users\\x\\repo')).toBe('C:\\Users\\x\\repo')
    expect(desktopCwdForSession('/opt/data/projects/acme')).toBe('')
  })
})

describe('repoNameFromUrl', () => {
  it('takes the last path segment', () => {
    expect(repoNameFromUrl('https://github.com/org/my-repo.git')).toBe('my-repo')
    expect(repoNameFromUrl('git@github.com:org/other.git')).toBe('other')
  })
})

describe('cloud bridge login probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('maps not-logged-in mint failures', async () => {
    vi.stubGlobal('window', {
      work4youDesktop: {
        isDesktop: true,
        cloud: {
          wsUrl: vi.fn(async () => ({ ok: false, error: 'not-logged-in' })),
          api: vi.fn()
        }
      }
    })

    const { probeCloudLogin, mintCloudWsUrl } = await import('./w4y-cloud-projects')
    await expect(mintCloudWsUrl()).rejects.toThrow(CLOUD_NOT_LOGGED_IN)
    await expect(probeCloudLogin()).resolves.toBe(false)
  })

  it('mints WS tickets from the browser cloud bridge (no isDesktop)', async () => {
    vi.stubGlobal('window', {
      work4youDesktop: {
        isDesktop: false,
        cloud: {
          wsUrl: vi.fn(async () => ({ ok: true, url: 'wss://app.work4you.ai/api/ws?ticket=t' })),
          api: vi.fn()
        }
      }
    })

    const { mintCloudWsUrl, cloudBridge, cloudApiBridge, cloudRunAvailable } = await import(
      './w4y-cloud-projects'
    )
    await expect(mintCloudWsUrl()).resolves.toContain('ticket=t')
    expect(cloudApiBridge()).not.toBeNull()
    expect(cloudBridge()).toBeNull()
    expect(cloudRunAvailable()).toBe(false)
  })
})
