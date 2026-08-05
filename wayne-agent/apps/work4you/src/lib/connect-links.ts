/**
 * Composio Connect Links in agent prose — strip/detect so the chat can render
 * an auth card instead of a bare URL (port of web FileRefCard extractConnectLinks).
 */

const CONNECT_URL_SRC =
  'https?:\\/\\/(?:dashboard|connect|app)\\.composio\\.dev\\/link\\/[A-Za-z0-9_-]+'
const CONNECT_URL_TEST = new RegExp(CONNECT_URL_SRC, 'i')
const CONNECT_MD_RE = new RegExp(`(?:👉\\s*)?\\[[^\\]]*\\]\\(\\s*(${CONNECT_URL_SRC})[^)]*\\)`, 'gi')
const CONNECT_BARE_RE = new RegExp(`(?:👉\\s*)?[\`<]?(${CONNECT_URL_SRC})[\`>]?`, 'gi')

export function isConnectLinkUrl(href: string | undefined | null): boolean {
  if (!href) return false
  return CONNECT_URL_TEST.test(href.trim())
}

export function extractConnectLinks(content: string): { text: string; links: string[] } {
  const links: string[] = []
  const push = (u: string) => {
    if (!links.includes(u)) links.push(u)
  }
  let text = content.replace(CONNECT_MD_RE, (_m, u: string) => {
    push(u)
    return ''
  })
  text = text.replace(CONNECT_BARE_RE, (_m, u: string) => {
    push(u)
    return ''
  })
  return { text, links }
}
