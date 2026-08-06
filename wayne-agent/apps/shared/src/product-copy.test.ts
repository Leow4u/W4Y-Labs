import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeProductCopy } from './product-copy.ts'

test('sanitizeProductCopy replaces legacy runtime brands', () => {
  assert.equal(sanitizeProductCopy('Wayne Agent failed'), 'Work4You failed')
  assert.equal(sanitizeProductCopy('Motor Wayne update'), 'Work4You update')
  assert.equal(sanitizeProductCopy('wayne whatsapp not paired'), 'Work4You whatsapp not paired')
  assert.equal(sanitizeProductCopy('Hermes Agent · v1'), 'Work4You · v1')
  assert.equal(sanitizeProductCopy('Wayne Console. Type help.'), 'Work4You Console. Type help.')
  assert.equal(sanitizeProductCopy('Sign in to Nous Portal'), 'Sign in to Work4You account')
  assert.equal(sanitizeProductCopy('Nous Research billing'), 'Work4You billing')
})

test('sanitizeProductCopy leaves env var names intact', () => {
  const envHint =
    'Unset HERMES_DESKTOP_REMOTE_URL and HERMES_DESKTOP_REMOTE_TOKEN to use the saved setting below.'
  assert.equal(sanitizeProductCopy(envHint), envHint)
})

test('sanitizeProductCopy is idempotent', () => {
  const once = sanitizeProductCopy('Wayne Agent')
  assert.equal(sanitizeProductCopy(once), 'Work4You')
})
