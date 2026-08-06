export {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayClientOptions,
  type GatewayEvent,
  type GatewayEventName,
  type GatewayRequestId,
  type JsonRpcFrame,
  type WebSocketLike
} from './json-rpc-gateway'
export {
  GatewayReauthRequiredError,
  buildWayneWebSocketUrl,
  buildWayneWebSocketUrl as buildHermesWebSocketUrl,
  isGatewayReauthRequired,
  resolveGatewayWsUrl,
  type GatewayAuthMode,
  type GatewayWsConnection,
  type WayneWebSocketUrlOptions,
  type WayneWebSocketUrlOptions as HermesWebSocketUrlOptions,
  type ResolveGatewayWsUrlDeps,
  type WebSocketAuthParam
} from './websocket-url'
export { sanitizeProductCopy } from './product-copy'
export { W4Y_DOCS_BASE, W4Y_LOGIN_URL, W4Y_PLANS_URL, w4yDocsPath } from './product-urls'
export {
  RELAY_25_FAST_LABEL,
  RELAY_FREE_FALLBACK_MODEL,
  RELAY_FREE_PRIMARY_MODEL,
  RELAY_FREE_PROVIDER,
  RELAY_FREE_REASONING,
  isRelayFreeModel,
  relayFreeFallbackChain
} from './relay-free-model'
