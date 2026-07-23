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
