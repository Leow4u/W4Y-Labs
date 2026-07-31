/**
 * Browser WebSocket client for the tui_gateway JSON-RPC protocol.
 *
 * Speaks the exact same newline-delimited JSON-RPC dialect that the Ink TUI
 * drives over stdio. The server-side transport abstraction
 * (tui_gateway/transport.py + ws.py) routes the same dispatcher's writes
 * onto either stdout or a WebSocket depending on how the client connected.
 *
 *   const gw = new GatewayClient()
 *   await gw.connect()
 *   const { session_id } = await gw.request<{ session_id: string }>("session.create")
 *   gw.on("message.delta", (ev) => console.log(ev.payload?.text))
 *   await gw.request("prompt.submit", { session_id, text: "hi" })
 */

import {
  JsonRpcGatewayClient,
  buildWayneWebSocketUrl,
  type ConnectionState,
  type GatewayEvent,
  type GatewayEventName,
} from "@wayne/shared";

import { WAYNE_BASE_PATH, buildWsAuthParam } from "@/lib/api";

export type { ConnectionState, GatewayEvent, GatewayEventName };

/** Returns a FULL ws(s):// URL, minted fresh per call. Used by cloud-target
 *  sessions on the local-engine desktop: the shell mints a single-use,
 *  short-TTL ticket into the URL, so every connect/reconnect must ask again —
 *  which is why this is a provider, never a stored URL. */
export type WsUrlProvider = () => Promise<string>;

export class GatewayClient extends JsonRpcGatewayClient {
  private readonly wsUrlProvider?: WsUrlProvider;

  constructor(wsUrlProvider?: WsUrlProvider) {
    super({
      closedErrorMessage: "WebSocket closed",
      connectErrorMessage: "WebSocket connection failed",
      notConnectedErrorMessage: "gateway not connected",
      requestIdPrefix: "w",
    });
    this.wsUrlProvider = wsUrlProvider;
  }

  async connect(token?: string): Promise<void> {
    if (this.connectionState === "open" || this.connectionState === "connecting") {
      return;
    }

    // Custom-URL path (cloud-target session): the provider mints a fresh
    // ticketed URL for THIS connect. WS upgrades don't do CORS, so the
    // renderer dials the cloud host directly.
    if (this.wsUrlProvider) {
      await super.connect(await this.wsUrlProvider());
      return;
    }

    // Gated mode: legacy ``?token=`` is rejected by ``_ws_auth_ok``; the SPA
    // must fetch a single-use ticket. Explicit ``token`` keeps the test-only
    // override path.
    const authParam = token ? (["token", token] as const) : await buildWsAuthParam();
    if (!authParam[1]) {
      throw new Error(
        "Session token not available — page must be served by the Work4You dashboard server",
      );
    }

    await super.connect(
      buildWayneWebSocketUrl({
        authParam,
        basePath: WAYNE_BASE_PATH,
        path: "/api/ws",
      }),
    );
  }
}
