/**
 * @agonx402/types — Shared type definitions for the Agon payment protocol.
 *
 * All amounts are in USDC smallest units (6 decimals): 1 USDC = 1_000_000 units.
 * All IDs are strings (UUIDs).
 * All timestamps are ISO 8601 strings.
 */

// Account & balance types
export type {
  Account,
  AccountBalance,
  AutoRefillSettings,
  AutoRefillConfig,
  RegisterAccountRequest,
  RegisterAccountResponse,
  DepositRequest,
  DepositResult,
  WithdrawRequest,
  WithdrawalResult,
  SetAutoRefillRequest,
} from "./account.js";

// API key types (replaces sessions)
export type {
  ApiKey,
  ApiKeyStatus,
  RotateKeyResponse,
  RevokeKeyRequest,
} from "./apikey.js";

// Reservation types (authorize / consume / release)
export type {
  Reservation,
  ReservationStatus,
  AuthorizeRequest,
  AuthorizeResponse,
  DenialReason,
  ConsumeRequest,
  ConsumeResponse,
  ReleaseRequest,
  ReleaseResponse,
  CreateTokenRequest,
  CreateTokenResponse,
} from "./reservation.js";

// Settlement types (batch on-chain payouts)
export type {
  Settlement,
  SettlementStatus,
  SettlementBatch,
} from "./settlement.js";

// Platform (merchant) types
export type {
  ApiPlatform,
  RegisterPlatformRequest,
  RegisterPlatformResponse,
} from "./platform.js";

// Proxy types (x402 proxy mode)
export type {
  ProxyRequest,
  ProxyResponse,
  ProxyTransaction,
} from "./proxy.js";

// Spending control types
export type {
  SpendingControls,
  SetSpendingControlsRequest,
  SpendingOverride,
  SpendingLimitExceededDetails,
} from "./spending.js";

// Error types
export type {
  ErrorCode,
  AgonErrorBody,
} from "./errors.js";
export { AgonError } from "./errors.js";

// Config types
export type {
  AgonPlatformConfig,
  PricingFunction,
  AgonRouteConfig,
  OverrideSigner,
} from "./config.js";
export { AGON_HEADERS, USDC, parsePrice } from "./config.js";
