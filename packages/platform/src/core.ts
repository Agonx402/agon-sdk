import {
  type AgonPlatformConfig,
  type AuthorizeResponse,
  type ConsumeResponse,
  type ReleaseResponse,
  AGON_HEADERS,
  parsePrice,
  AgonError,
} from "@agonx402/types";
import { AgonHttpClient } from "./http.js";

/**
 * Core platform logic — framework-agnostic.
 *
 * Given a request, this class:
 * 1. Extracts the consumer's auth token from the X-AGON-TOKEN header
 * 2. Calls Agon /authorize to reserve funds (the token is single-use)
 * 3. Returns whether the request should be served
 * 4. After serving, calls /consume or /release
 *
 * The consumer's raw API key (ak_xxx) is never sent to merchants.
 * Merchants only ever see short-lived, single-use auth tokens.
 */
export class AgonPlatformCore {
  private client: AgonHttpClient;
  private config: AgonPlatformConfig;

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
   * Extract spending override headers from the request.
   * Returns null if no override is present.
   *
   * The consumer's SDK sets these headers when retrying with a wallet signature
   * to bypass spending limits.
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
   * Build a 402 Payment Required response body.
   * Tells the consumer how to pay for this resource.
   */
  buildPaymentRequiredResponse(price: bigint): {
    status: number;
    body: Record<string, unknown>;
  } {
    return {
      status: 402,
      body: {
        error: "payment_required",
        message: "This resource requires payment via Agon",
        payment_info: {
          price: Number(price),
          currency: "USDC",
          description: this.config.description ?? "Protected resource",
          mime_type: this.config.mimeType,
          instructions: "Include your Agon auth token as the X-AGON-TOKEN header (create via POST /account/create-token)",
          register_url: `${this.config.agonUrl}/account/register`,
        },
      },
    };
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
