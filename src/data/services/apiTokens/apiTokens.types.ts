export type ApiTokenScope = 'orders:write' | 'shopify_webhook' | 'vtex_webhook';

export interface ApiTokenRow {
  id: string;
  org_id: string;
  name: string;
  token_prefix: string;
  scopes: ApiTokenScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
}

export interface ApiTokenCreateInput {
  orgId: string;
  name: string;
  scopes: ApiTokenScope[];
}

export interface ApiTokenCreateResult {
  token: ApiTokenRow;
  /** Token en claro. Solo devuelto UNA VEZ al crear. */
  plaintext: string;
}
