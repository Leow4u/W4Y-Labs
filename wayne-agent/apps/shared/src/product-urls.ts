/** Work4You-owned URLs — use instead of legacy Hermes/Nous doc hosts. */
export const W4Y_DOCS_BASE = 'https://work4you.ai/documentacao'
export const W4Y_LOGIN_URL = 'https://work4you.ai/login'
export const W4Y_PLANS_URL = 'https://work4you.ai/planos'

export function w4yDocsPath(segment = ''): string {
  const path = segment.replace(/^\//, '')
  return path ? `${W4Y_DOCS_BASE}/${path}` : W4Y_DOCS_BASE
}
