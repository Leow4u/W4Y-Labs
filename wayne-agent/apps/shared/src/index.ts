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
