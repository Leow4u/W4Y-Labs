'use strict'

async function rehomePrimaryConnection({
  clearLocalBootstrapFailure,
  mode,
  notifyConnectionApplied,
  resumeFirstRunRemote,
  teardownPrimaryBackend
}) {
  let resumedFirstRunRemote = false

  if (mode === 'remote') {
    resumedFirstRunRemote = resumeFirstRunRemote()
    clearLocalBootstrapFailure()
  }

  if (resumedFirstRunRemote) {
    return { resumedFirstRunRemote: true }
  }

  await teardownPrimaryBackend({ soft: true })
  notifyConnectionApplied()

  return { resumedFirstRunRemote: false }
}

module.exports = { rehomePrimaryConnection }
