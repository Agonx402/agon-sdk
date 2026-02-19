/**
 * API Platform (Merchant) — represents a service that charges consumers via Agon.
 *
 * Merchants register with Agon and receive a platform key (pk_xxx).
 * They use this key to authenticate /authorize and /consume calls.
 * Settlement payouts go to the merchant's wallet address.
 */

export interface ApiPlatform {
  platformId: string;
  name: string;
  walletAddress: string;
  /** Only the hash is stored */
  apiKeyHash: string;
  webhookUrl: string | null;
  active: boolean;
  createdAt: string;
}

export interface RegisterPlatformRequest {
  name: string;
  walletAddress: string;
  webhookUrl?: string;
}

export interface RegisterPlatformResponse {
  platformId: string;
  /** Platform API key — shown once, must be stored. Used as Authorization: Bearer pk_xxx */
  apiKey: string;
  name: string;
  walletAddress: string;
}
