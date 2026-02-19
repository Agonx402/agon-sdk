/**
 * Spending Controls — consumer-configurable limits that protect against
 * unauthorized or excessive spending.
 *
 * These act as guardrails: normal low-cost API calls flow freely,
 * but large or suspicious charges are blocked unless the consumer
 * explicitly approves with a wallet signature.
 */

export interface SpendingControls {
  /** Max USDC per single request (both /authorize and /proxy). 0 = unlimited. */
  maxPerRequest: number;
  /** Max USDC per rolling 24h window. 0 = unlimited. */
  dailySpendingLimit: number;
  /** Amount already spent in current 24h window. */
  dailySpent: number;
  /** When the daily counter resets (ISO 8601). */
  dailyResetAt: string;
  /** Whether proxy mode is enabled (standard x402 merchant passthrough). */
  proxyEnabled: boolean;
  /** If set, proxy only works for these domains. Empty/null = all allowed. */
  proxyAllowedDomains: string[] | null;
}

export interface SetSpendingControlsRequest {
  /** Max USDC per single request (USDC smallest units). 0 = unlimited. */
  max_per_request?: number;
  /** Max USDC per rolling 24h window (USDC smallest units). 0 = unlimited. */
  daily_spending_limit?: number;
  /** Whether proxy mode is enabled. */
  proxy_enabled?: boolean;
  /** Domains the proxy is allowed to pay. Empty array = all allowed. */
  proxy_allowed_domains?: string[] | null;
}

/**
 * Wallet signature override — allows a consumer to bypass spending limits
 * for a specific transaction by proving wallet ownership.
 *
 * The signature message format:
 *   "agon:override:<account_id>:<request_id>:<amount>:<merchant_domain>:<timestamp>"
 *
 * This prevents replay attacks (unique request_id + timestamp)
 * and ensures the consumer approved the exact amount and merchant.
 */
export interface SpendingOverride {
  /** ed25519 signature of the override message, base58-encoded */
  signature: string;
  /** The exact message that was signed */
  message: string;
}

export interface SpendingLimitExceededDetails {
  /** Which limit was exceeded */
  limit_type: "max_per_request" | "daily_spending_limit" | "proxy_disabled" | "proxy_domain_blocked";
  /** The amount requested */
  requested: number;
  /** The limit value */
  limit: number;
  /** Current daily spent (if applicable) */
  daily_spent?: number;
  /** Whether the consumer can override with a wallet signature */
  override_available: boolean;
  /** The message the consumer should sign to override (if override_available) */
  sign_message?: string;
  /** Merchant domain (for proxy domain blocks) */
  merchant_domain?: string;
}
