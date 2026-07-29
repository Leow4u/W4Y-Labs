/**
 * Shell / web chat: mint a fresh Composio tool-router session and ask the
 * live gateway to reload MCP so mcp_composio_* tools appear on the agent.
 *
 * Desktop-shell loads this web UI — not apps/desktop. UI "connected" status
 * alone does not load MCP tools into the session.
 */
export const ENSURE_COMPOSIO_MCP_EVENT = "wayne:ensure-composio-mcp";

export function requestEnsureComposioMcp(force = false): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ENSURE_COMPOSIO_MCP_EVENT, { detail: { force } }),
  );
}
