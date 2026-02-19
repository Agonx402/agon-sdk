/**
 * Reservation — represents a fund hold for a specific request.
 *
 * Flow: reserved -> consumed (charge confirmed) or released (charge cancelled/expired)
 *
 * Created by POST /authorize (merchant calls this before serving a request).
 * Confirmed by POST /consume (merchant calls this after successful response).
 * Released by POST /release or by auto-expiry job if merchant never consumes.
 */

export type ReservationStatus = "reserved" | "consumed" | "released" | "expired" | "settled";

export interface Reservation {
  reservationId: string;
  accountId: string;
  platformId: string;
  requestId: string;
  amount: bigint;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
}

export interface AuthorizeRequest {
  /**
   * Consumer auth token — a short-lived, single-use, server-signed token
   * obtained from POST /account/create-token. The consumer sends this to
   * merchants instead of their raw API key. Each token can only authorize
   * one reservation (enforced by UNIQUE constraint on token_jti).
   */
  consumerToken: string;
  /** Idempotency key — prevents double-charging on retries */
  requestId: string;
  /** Amount to reserve in USDC smallest units */
  amount: bigint;
}

export interface CreateTokenRequest {
  /** Token TTL in seconds. Default 60, min 1, max 300. */
  ttl?: number;
  /** Maximum charge amount the merchant can request (USDC smallest units). If omitted, no cap is applied beyond spending controls. */
  max_amount?: number;
}

export interface CreateTokenResponse {
  /** The signed consumer auth token */
  token: string;
  /** TTL in seconds */
  expires_in: number;
  /** The max amount cap baked into the token, if one was set */
  max_amount?: number;
}

/**
 * API response types use snake_case to match the JSON wire format
 * returned by the Agon backend.
 */
export interface AuthorizeResponse {
  reservation_id: string | null;
  status: "approved" | "denied";
  amount: number;
  expires_at: string | null;
  /** Present when status is "denied" */
  reason?: DenialReason;
}

export type DenialReason =
  | "insufficient_balance"
  | "invalid_consumer_token"
  | "consumer_key_revoked"
  | "token_already_used"
  | "amount_exceeds_token_cap"
  | "duplicate_request"
  | "platform_not_found"
  | "spending_limit_exceeded"
  | "rate_limited";

export interface ConsumeRequest {
  reservation_id: string;
}

export interface ConsumeResponse {
  reservation_id: string;
  status: "consumed";
  amount: number;
}

export interface ReleaseRequest {
  reservation_id: string;
}

export interface ReleaseResponse {
  reservation_id: string;
  status: "released";
  amount: number;
}
