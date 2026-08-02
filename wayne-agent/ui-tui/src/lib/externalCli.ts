import { spawn } from 'node:child_process'

export interface LaunchResult {
  code: null | number
  error?: string
}

// Canonical command first, legacy alias second. `/setup` advertises
// `work4you setup`, so that is what must actually run; `wayne` stays as the
// fallback because an install that predates the brand migration only has the
// old console script on PATH. `WORK4YOU_BIN` / `WAYNE_BIN` still win — the
// Python env bridge does not reach this Node process, so both spellings are
// read here explicitly.
const resolveWayneBins = (): string[] => {
  const override = (process.env.WORK4YOU_BIN ?? process.env.WAYNE_BIN ?? '').trim()
  return override ? [override] : ['work4you', 'wayne']
}

const launchOne = (bin: string, args: string[]): Promise<LaunchResult> =>
  new Promise(resolve => {
    const child = spawn(bin, args, { stdio: 'inherit' })

    child.on('error', err => resolve({ code: null, error: err.message }))
    child.on('exit', code => resolve({ code }))
  })

export const launchWayneCommand = async (args: string[]): Promise<LaunchResult> => {
  const bins = resolveWayneBins()
  let last: LaunchResult = { code: null, error: 'no command resolved' }

  for (const bin of bins) {
    last = await launchOne(bin, args)
    // Only a missing executable is worth retrying under the other spelling —
    // a real exit code (including a failure) is the command's own answer.
    if (!last.error) {
      return last
    }
  }

  return last
}
