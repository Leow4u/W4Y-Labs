/** Work4You wiring for Conectores (Composio tool-router). Never expose in MCP UI. */

export type McpServerMap = Record<string, Record<string, unknown>>

const INTERNAL_MCP_SERVERS = new Set(['composio'])

export function isInternalMcpServer(name: string): boolean {
  return INTERNAL_MCP_SERVERS.has(name.trim().toLowerCase())
}

export function withoutInternalMcp(map: McpServerMap): McpServerMap {
  return Object.fromEntries(Object.entries(map).filter(([name]) => !isInternalMcpServer(name)))
}

/** Re-inject internal servers from config so a product Save cannot wipe Composio. */
export function mergePreservingInternalMcp(userFacing: McpServerMap, sourceOfTruth: McpServerMap): McpServerMap {
  const internal = Object.fromEntries(Object.entries(sourceOfTruth).filter(([name]) => isInternalMcpServer(name)))

  return { ...withoutInternalMcp(userFacing), ...internal }
}
