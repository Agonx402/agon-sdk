/**
 * Errors — standardized error types used across all Agon packages.
 *
 * Every error response from the Agon backend follows this shape.
 * SDKs parse these into AgonError instances with typed error codes.
 */

export type ErrorCode =
  // Account errors
  | "account_not_found"
  | "account_already_exists"
  | "wallet_address_invalid"

  // Balance errors
  | "insufficient_balance"
  | "insufficient_available_balance"
  | "withdrawal_exceeds_available"

  // Deposit errors
  | "deposit_tx_not_found"
  | "deposit_tx_invalid_destination"
  | "deposit_tx_invalid_mint"
  | "deposit_tx_already_credited"
  | "deposit_tx_not_confirmed"

  // API key errors
  | "invalid_api_key"
  | "api_key_revoked"
  | "api_key_not_found"

  // Platform errors
  | "platform_not_found"
  | "platform_inactive"
  | "invalid_platform_key"

  // Reservation errors
  | "reservation_not_found"
  | "reservation_already_consumed"
  | "reservation_already_released"
  | "reservation_expired"
  | "duplicate_request_id"

  // Auto-refill errors
  | "refill_not_active"
  | "refill_monthly_limit_reached"
  | "refill_delegation_insufficient"
  | "refill_wallet_insufficient"

  // Proxy errors
  | "proxy_payment_required_invalid"
  | "proxy_merchant_unreachable"
  | "proxy_x402_payment_failed"
  | "proxy_unsupported_network"
  | "proxy_disabled"
  | "proxy_domain_blocked"

  // Spending control errors
  | "spending_limit_exceeded"
  | "spending_override_invalid"
  | "spending_override_expired"
  | "spending_override_signature_mismatch"

  // General errors
  | "validation_error"
  | "rate_limited"
  | "internal_error";

export interface AgonErrorBody {
  error: ErrorCode;
  message: string;
  /** Additional context (e.g., available balance, requested amount) */
  details?: Record<string, unknown>;
}

/**
 * Typed error class for use in SDKs.
 * Thrown by @agonx402/client and @agonx402/platform when the backend returns an error.
 */
export class AgonError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown>;

  constructor(statusCode: number, body: AgonErrorBody) {
    super(body.message);
    this.name = "AgonError";
    this.code = body.error;
    this.statusCode = statusCode;
    this.details = body.details ?? {};
  }

  /** Check if this error is a specific code */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /** Check if this is an insufficient balance error */
  isInsufficientBalance(): boolean {
    return (
      this.code === "insufficient_balance" ||
      this.code === "insufficient_available_balance" ||
      this.code === "withdrawal_exceeds_available"
    );
  }

  /** Check if this is an authentication error */
  isAuthError(): boolean {
    return (
      this.code === "invalid_api_key" ||
      this.code === "api_key_revoked" ||
      this.code === "invalid_platform_key"
    );
  }

  /** Check if this is a spending limit error (can be overridden with wallet signature) */
  isSpendingLimitExceeded(): boolean {
    return this.code === "spending_limit_exceeded";
  }

  /** Check if override is available for this spending limit error */
  isOverrideAvailable(): boolean {
    return this.code === "spending_limit_exceeded" && this.details.override_available === true;
  }

  /** Get the message to sign for a spending override (if available) */
  getOverrideSignMessage(): string | null {
    if (!this.isOverrideAvailable()) return null;
    return (this.details.sign_message as string) ?? null;
  }

  toJSON(): AgonErrorBody {
    return {
      error: this.code,
      message: this.message,
      details: Object.keys(this.details).length > 0 ? this.details : undefined,
    };
  }
}
