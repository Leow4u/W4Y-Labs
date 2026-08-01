import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Work4You home directory, resolved the same way the Python engine does
 * (`work4you_constants.get_wayne_home`).
 *
 * The brand migration moved the default root from `~/.wayne` to
 * `~/.work4you`; an install that has not been migrated yet still keeps its
 * data under the legacy name, so both are probed — new name first, exactly
 * like `_get_platform_default_wayne_home()`. Windows keeps its own root
 * under `%LOCALAPPDATA%`.
 *
 * Never hard-code a spelling: the value is profile-scoped, platform-specific
 * and relocatable via `WORK4YOU_HOME`.
 */
export function homeDir(): string {
  const env = (process.env.WAYNE_HOME ?? process.env.WORK4YOU_HOME ?? '').trim()
  if (env) {
    return env
  }

  const base =
    process.platform === 'win32'
      ? (process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local'))
      : homedir()
  const [next, legacy] =
    process.platform === 'win32'
      ? [join(base, 'work4you'), join(base, 'wayne')]
      : [join(base, '.work4you'), join(base, '.wayne')]

  if (existsSync(next)) {
    return next
  }
  if (existsSync(legacy)) {
    return legacy
  }
  return next
}

/** `~/`-shortened display string for {@link homeDir}, for UI copy. */
export function displayHomeDir(): string {
  const home = homeDir()
  const user = homedir()
  if (home.startsWith(user + '/') || home.startsWith(user + '\\')) {
    return '~/' + home.slice(user.length + 1)
  }
  return home
}
