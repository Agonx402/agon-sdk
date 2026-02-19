/**
 * API Key — replaces sessions. One key per consumer, works across all merchants.
 *
 * Consumer gets an API key on registration (ak_xxx).
 * They include it as X-AGON-KEY header in every request to any merchant.
 * The merchant's middleware extracts it and passes it to Agon for authorization.
 */

export type ApiKeyStatus = "active" | "revoked";

export interface ApiKey {
  keyId: string;
  accountId: string;
  /** Only the hash is stored in DB. The plaintext key is shown once on creation. */
  keyHash: string;
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface RotateKeyResponse {
  /** New API key — shown once, must be stored */
  apiKey: string;
  /** Old key is revoked immediately */
  previousKeyRevoked: boolean;
}

export interface RevokeKeyRequest {
  accountId: string;
}
