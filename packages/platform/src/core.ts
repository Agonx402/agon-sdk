import {
  type AgonPlatformConfig,
  type AuthorizeResponse,
  type ConsumeResponse,
  type ReleaseResponse,
  AGON_HEADERS,
  USDC,
  parsePrice,
  AgonError,
} from "@agonx402/types";
import { AgonHttpClient } from "./http.js";

/**
 * Core platform logic — framework-agnostic.
 *
 * Supports two payment modes:
 *
 * 1. Agon-native (default): Consumer sends X-AGON-TOKEN. Merchant calls /authorize,
 *    /consume, /release against Agon's off-chain ledger. Zero blockchain latency.
 *
 * 2. StandardX (standard x402): Any standard x402 buyer can pay.
 *    Merchant emits a PAYMENT-REQUIRED header (standard x402 PaymentRequirements).
 *    Buyer partially signs a Solana USDC transfer and sends PAYMENT-SIGNATURE.
 *    Merchant SDK forwards to Agon's /platform/sponsor-tx. Agon co-signs as feePayer
 *    and broadcasts. A $0.001 fee is deducted from the merchant's Agon balance.
 */
export class AgonPlatformCore {
  private client: AgonHttpClient;
  private config: AgonPlatformConfig;
  /** Cached wallet address for standardx payments. */
  private cachedStandardxWallet: string | null = null;

  constructor(config: AgonPlatformConfig) {
    this.config = config;
    this.client = new AgonHttpClient({
      agonUrl: config.agonUrl,
      platformKey: config.platformKey,
      timeout: config.timeout,
    });
  }

  /**
   * Extract the consumer's auth token from the X-AGON-TOKEN header.
   * Returns null if not present.
   */
  extractConsumerToken(headers: Record<string, string | string[] | undefined>): string | null {
    const token = headers[AGON_HEADERS.CONSUMER_TOKEN.toLowerCase()] ??
      headers[AGON_HEADERS.CONSUMER_TOKEN];
    if (!token) return null;
    return Array.isArray(token) ? token[0] : token;
  }

  /**
   * Extract the standard x402 PAYMENT-SIGNATURE header (legacy x402 buyer flow).
   * Returns the raw base64 PaymentPayload string, or null if not present.
   */
  extractPaymentSignature(headers: Record<string, string | string[] | undefined>): string | null {
    const sig = headers[AGON_HEADERS.PAYMENT_SIGNATURE.toLowerCase()] ??
      headers[AGON_HEADERS.PAYMENT_SIGNATURE];
    if (!sig) return null;
    return Array.isArray(sig) ? sig[0] : sig;
  }

  /**
   * Extract spending override headers from the request.
   * Returns null if no override is present.
   */
  extractOverride(headers: Record<string, string | string[] | undefined>): {
    signature: string;
    message: string;
  } | null {
    const sig = headers["x-agon-override-sig"] ?? headers["X-AGON-OVERRIDE-SIG"];
    const msg = headers["x-agon-override-msg"] ?? headers["X-AGON-OVERRIDE-MSG"];
    if (!sig || !msg) return null;

    const sigStr = Array.isArray(sig) ? sig[0] : sig;
    const msgStr = Array.isArray(msg) ? msg[0] : msg;
    if (!sigStr || !msgStr) return null;

    return { signature: sigStr, message: msgStr };
  }

  /**
   * Calculate the price for a request.
   * Uses the configured pricing (static or dynamic).
   */
  async calculatePrice(request: unknown): Promise<bigint> {
    const pricing = this.config.pricing;

    if (typeof pricing === "function") {
      const result = await pricing(request);
      return typeof result === "bigint" ? result : BigInt(result);
    }

    return parsePrice(pricing as string | number | bigint);
  }

  /**
   * Authorize a payment — call before serving the request.
   *
   * Returns the authorization result. If approved, includes a reservationId
   * that must be consumed or released after the request is handled.
   *
   * Each consumer_token is single-use: a second call with the same token
   * returns the existing reservation (or a denial if already consumed/released).
   */
  async authorize(
    consumerToken: string,
    requestId: string,
    amount: bigint,
    override?: { signature: string; message: string } | null
  ): Promise<AuthorizeResponse> {
    const body: Record<string, unknown> = {
      consumer_token: consumerToken,
      request_id: requestId,
      amount: Number(amount),
    };

    if (override) {
      body.override = override;
    }
    return this.client.post<AuthorizeResponse>("/authorize", body);
  }

  /**
   * Consume a reservation — call after successfully serving the request.
   */
  async consume(reservationId: string): Promise<ConsumeResponse> {
    return this.client.post<ConsumeResponse>("/consume", {
      reservation_id: reservationId,
    });
  }

  /**
   * Release a reservation — call if the request failed or was cancelled.
   */
  async release(reservationId: string): Promise<ReleaseResponse> {
    return this.client.post<ReleaseResponse>("/release", {
      reservation_id: reservationId,
    });
  }

  /**
   * Sponsor a standardx (standard x402) transaction.
   *
   * Called when the merchant SDK receives a PAYMENT-SIGNATURE header from a
   * standard x402 buyer. Forwards the partial tx to Agon's /platform/sponsor-tx
   * endpoint, which verifies it, co-signs as feePayer, and broadcasts it.
   *
   * Returns the Solana tx signature on success.
   */
  async sponsorStandardxTx(
    paymentSignature: string,
    paymentRequired: string,
    expectedAmount: bigint
  ): Promise<{ tx_signature: string; network: string }> {
    return this.client.post("/platform/sponsor-tx", {
      payment_signature: paymentSignature,
      payment_required: paymentRequired,
      expected_amount: Number(expectedAmount),
    });
  }

  /**
   * Resolve the merchant's wallet address for standardx payments.
   *
   * Priority:
   * 1. walletAddress from config (merchant override)
   * 2. Cached from a previous lookup
   * 3. Fetched from Agon backend via GET /platform/info
   */
  async resolveStandardxWallet(): Promise<string> {
    if (this.config.walletAddress) {
      return this.config.walletAddress;
    }
    if (this.cachedStandardxWallet) {
      return this.cachedStandardxWallet;
    }
    const info = await this.client.get<{ wallet_address: string }>("/platform/info");
    this.cachedStandardxWallet = info.wallet_address;
    return info.wallet_address;
  }

  /**
   * Build a 402 Payment Required response.
   *
   * Returns a JSON body for Agon-native buyers (use X-AGON-TOKEN) while also
   * supporting standard x402 buyers via the PAYMENT-REQUIRED header (see
   * buildLegacyPaymentRequiredHeader). Legacy x402 is always enabled.
   */
  buildPaymentRequiredResponse(price: bigint): {
    status: number;
    body: Record<string, unknown>;
  } {
    return {
      status: 402,
      body: {
        error: "payment_required",
        message: "This resource requires payment. Use X-AGON-TOKEN (Agon) or PAYMENT-SIGNATURE (standard x402).",
        payment_info: {
          price: Number(price),
          currency: "USDC",
          description: this.config.description ?? "Protected resource",
          mime_type: this.config.mimeType,
          instructions: "Agon-native buyers: use X-AGON-TOKEN. Standard x402 buyers: see PAYMENT-REQUIRED header.",
          register_url: `${this.config.agonUrl}/account/register`,
        },
      },
    };
  }

  /**
   * Build the standard x402 PAYMENT-REQUIRED header value (standardx mode).
   *
   * Returns a base64-encoded JSON array of PaymentRequirements objects.
   * Must be set as the PAYMENT-REQUIRED response header.
   *
   * Requires async wallet resolution — call this separately from buildPaymentRequiredResponse.
   */
  async buildStandardxPaymentRequiredHeader(
    price: bigint,
    resource: string,
    network: "solana-devnet" | "solana-mainnet-beta" = "solana-devnet"
  ): Promise<string> {
    const walletAddress = await this.resolveStandardxWallet();
    const usdcMint = network === "solana-mainnet-beta" ? USDC.MAINNET_MINT : USDC.DEVNET_MINT;

    const paymentRequirements = [
      {
        scheme: "exact",
        network,
        maxAmountRequired: price.toString(),
        resource,
        description: this.config.description ?? "Protected resource",
        mimeType: this.config.mimeType,
        payTo: walletAddress,
        asset: usdcMint,
      },
    ];

    return Buffer.from(JSON.stringify(paymentRequirements)).toString("base64");
  }
}

/**
 * Generate a unique request ID for idempotency.
 * Uses timestamp + random for uniqueness.
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${random}`;
}
