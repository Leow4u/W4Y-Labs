/** Composio connector shapes — mirror of web `lib/api.ts` connector types. */

export interface ConnectorToolkit {
  slug: string
  name: string
  description: string
  logo: string | null
  categories: string[]
  no_auth: boolean
  managed_auth: boolean
  auth_schemes: string[]
  tools_count: number | null
  triggers_count: number | null
}

export interface ConnectorCatalogResponse {
  toolkits: ConnectorToolkit[]
  total: number
}

export interface ConnectorAccount {
  id: string
  toolkit: string
  /** INITIALIZING | INITIATED | ACTIVE | FAILED | EXPIRED | INACTIVE | REVOKED */
  status: string
  created_at?: string | null
}

export interface ConnectorStatusResponse {
  scope: string
  user_id: string
  accounts: ConnectorAccount[]
  attached: number
  homes: number
  entry: string
}

export interface ConnectorConnectResponse {
  scope: string
  toolkit: string
  redirect_url?: string
  connected_account_id?: string
  no_auth?: boolean
  attached: number
}

/** A toolkit's trigger type (e.g. GMAIL_NEW_GMAIL_MESSAGE). */
export interface ConnectorTriggerType {
  slug: string
  name: string
  toolkit?: null | string
  description: string
}

/** An ACTIVE Composio trigger in the scope. */
export interface ConnectorTrigger {
  id: string
  trigger: string
  toolkit?: null | string
  disabled: boolean
}

export interface ConnectorTriggersResponse {
  scope: string
  triggers: ConnectorTrigger[]
}

export interface ConnectorTriggerCreateResponse {
  ok: boolean
  scope: string
  trigger: string
  webhook: string
  id?: string
  connected_account_id?: string
  /** Set when the trigger was created but event delivery may not reach us (e.g. localhost). */
  warning?: string
}

/** Best-effort connector-event / kanban activity row (may be empty). */
export interface ConnectorEventRun {
  id: string
  title: string
  created_at?: null | number | string
  status?: null | string
  session_id?: null | string
  source?: null | string
}
