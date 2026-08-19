'use strict'

const { app, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

/** Bump when terms change materially — re-prompts packaged users once. */
const EULA_VERSION = '2026-08-06'
const TERMS_URL = 'https://work4you.ai/termos'
const PRIVACY_URL = 'https://work4you.ai/privacidade'

function markerPath() {
  return path.join(app.getPath('userData'), 'eula-accepted.json')
}

function readAcceptedVersion() {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(), 'utf8'))
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

/**
 * Packaged builds only. Returns false when the user declines (caller should quit).
 * @param {import('electron').BrowserWindow | null | undefined} [parentWindow]
 */
async function ensureEulaAccepted(parentWindow) {
  if (!app.isPackaged) return true
  if (readAcceptedVersion() === EULA_VERSION) return true

  const parent =
    parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined

  const { response } = await dialog.showMessageBox(parent, {
    type: 'info',
    title: 'Work4You',
    message: 'Termos de uso',
    detail:
      `Para usar o Work4You, aceite os Termos de Serviço e a Política de Privacidade.\n\n` +
      `Termos: ${TERMS_URL}\n` +
      `Privacidade: ${PRIVACY_URL}\n\n` +
      `O software é proprietário W4Y Labs. Uso não autorizado, engenharia reversa ou redistribuição são proibidos.`,
    buttons: ['Aceitar', 'Sair'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response !== 0) return false

  fs.mkdirSync(path.dirname(markerPath()), { recursive: true })
  fs.writeFileSync(
    markerPath(),
    JSON.stringify({ version: EULA_VERSION, acceptedAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return true
}

module.exports = { ensureEulaAccepted, EULA_VERSION, readAcceptedVersion }
