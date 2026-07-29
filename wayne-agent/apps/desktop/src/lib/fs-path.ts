/**
 * Cross-platform path helpers for desktop UI (Windows drive letters + mixed
 * `/` `\` from gateway/session cwd reporting).
 */

/** Strip trailing separators and normalize to lowercase forward slashes. */
export function normalizeFsPath(path: null | string | undefined): string {
  return (path ?? '').trim().replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
}

export function pathsEqual(a: null | string | undefined, b: null | string | undefined): boolean {
  const left = normalizeFsPath(a)
  const right = normalizeFsPath(b)

  return Boolean(left && right && left === right)
}

/** True when `child` is `parent` or a nested path under it. */
export function pathIsInside(parent: null | string | undefined, child: null | string | undefined): boolean {
  const root = normalizeFsPath(parent)
  const target = normalizeFsPath(child)

  if (!root || !target) {
    return false
  }

  return target === root || target.startsWith(`${root}/`)
}

/** Absolute POSIX, Windows drive, UNC, or file:// URL. */
export function isAbsoluteFsPath(path: string): boolean {
  const raw = path.trim()

  if (!raw) {
    return false
  }

  if (/^file:\/\//i.test(raw)) {
    return true
  }

  if (raw.startsWith('/') || raw.startsWith('\\\\')) {
    return true
  }

  return /^[a-zA-Z]:[\\/]/.test(raw)
}
