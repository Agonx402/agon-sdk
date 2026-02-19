/**
 * Proxy — types for the x402 proxy mode.
 *
 * When a consumer calls agon.fetch() on a merchant that only has standard x402,
 * the client SDK auto-detects the 402 response and routes through Agon's proxy.
 *
 * Agon parses the payment requirements, checks the consumer's balance,
 * deducts the amount, signs the x402 payment with Agon's wallet,
 * and forwards the request to the merchant.
 */

export interface ProxyRequest {
  /** The merchant URL to call */
  url: string;
  /** HTTP method */
  method: string;
  /** Request headers to forward (excluding payment headers) */
  headers?: Record<string, string>;
  /** Request body to forward */
  body?: string;
  /** Base64-encoded PAYMENT-REQUIRED header from the merchant's 402 response */
  paymentRequired: string;
}

export interface ProxyResponse {
  /** HTTP status from the merchant */
  status: number;
  /** Response headers from the merchant */
  headers: Record<string, string>;
  /** Response body from the merchant */
  body: string;
  /** Amount deducted from consumer's balance */
  amountCharged: bigint;
  /** Solana transaction signature of the x402 payment (Agon → merchant) */
  txSignature: string | null;
}

export interface ProxyTransaction {
  proxyTxId: string;
  accountId: string;
  merchantUrl: string;
  amount: bigint;
  /** The x402 network used (e.g., "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") */
  network: string;
  x402TxSignature: string | null;
  createdAt: string;
}
