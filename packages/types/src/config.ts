/**
 * Configuration types — used by @agonx402/client and @agonx402/platform SDKs.
 */

export interface AgonPlatformConfig {
  /** Agon backend URL */
  agonUrl: string;
  /** Platform API key (pk_xxx) from POST /platform/register */
  platformKey: string;
  /** Fixed price or dynamic pricing function. String format: "$0.001". Number: raw USDC units. */
  pricing: number | string | PricingFunction;
  /** Human-readable description of the resource (shown in 402 responses) */
  description?: string;
  /** MIME type of the resource (shown in 402 responses) */
  mimeType?: string;
  /** Request timeout in ms for calls to Agon backend (default: 5_000) */
  timeout?: number;
  /**
   * Optional Solana wallet address for receiving standardx payments.
   * If omitted, Agon uses the wallet_address from your platform registration.
   *
   * Note: StandardX support is always enabled. Any standard x402 buyer can pay
   * your endpoint without an Agon account. Agon acts as the x402 facilitator
   * (co-signs as feePayer, broadcasts on-chain). A $0.001 facilitation fee is
   * deducted from your Agon balance per transaction — ensure your balance stays funded.
   */
  walletAddress?: string;
  /** Called when a request is missing a valid payment header */
  onPaymentRequired?: (req: unknown) => void;
  /** Called after successful authorization */
  onAuthorized?: (reservationId: string, amount: bigint) => void;
  /** Called after successful consumption */
  onConsumed?: (reservationId: string, amount: bigint) => void;
}


/**
 * Dynamic pricing function — receives the incoming request,
 * returns the price in USDC smallest units.
 */
export type PricingFunction = (req: unknown) => number | bigint | Promise<number | bigint>;

export interface AgonRouteConfig {
  /** Platform API key (pk_xxx) */
  platformKey: string;
  /** Price for this specific route */
  pricing: number | string | PricingFunction;
  /** Description shown in 402 responses */
  description?: string;
  /** MIME type shown in 402 responses */
  mimeType?: string;
}

/**
 * Override signer — abstracts how spending override messages are signed.
 *
 * For Node.js / AI agents: implemented using nacl.sign.detached with a Keypair.
 * For browsers / Privy: implemented by opening a popup or calling Privy's signMessage.
 */
export type OverrideSigner = (
  message: string
) => Promise<{ signature: string; message: string }>;

/**
 * Header names used in the Agon protocol.
 */
export const AGON_HEADERS = {
  /** Consumer's API key header — used ONLY for direct consumer→Agon API calls (never sent to merchants) */
  CONSUMER_KEY: "X-AGON-KEY",
  /** Consumer's short-lived, single-use auth token — used when calling merchant APIs */
  CONSUMER_TOKEN: "X-AGON-TOKEN",
  /** Standard x402 payment required header (used in 402 responses for x402 compat) */
  PAYMENT_REQUIRED: "PAYMENT-REQUIRED",
  /** Standard x402 payment signature header */
  PAYMENT_SIGNATURE: "PAYMENT-SIGNATURE",
  /** Standard x402 payment response header */
  PAYMENT_RESPONSE: "PAYMENT-RESPONSE",
} as const;

/**
 * USDC constants.
 */
export const USDC = {
  DECIMALS: 6,
  /** 1 USDC in smallest units */
  ONE: BigInt(1_000_000),
  /** Devnet USDC mint address */
  DEVNET_MINT: "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
  /** Mainnet USDC mint address */
  MAINNET_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

/**
 * Parse a price string like "$0.001" into USDC smallest units.
 * Returns bigint.
 */
export function parsePrice(price: string | number | bigint): bigint {
  if (typeof price === "bigint") return price;
  if (typeof price === "number") return BigInt(price);

  const str = price.trim();
  if (str.startsWith("$")) {
    const dollars = parseFloat(str.slice(1));
    if (isNaN(dollars) || dollars < 0) {
      throw new Error(`Invalid price string: "${price}"`);
    }
    return BigInt(Math.round(dollars * 1_000_000));
  }

  const num = parseFloat(str);
  if (isNaN(num)) {
    throw new Error(`Invalid price string: "${price}"`);
  }
  return BigInt(Math.round(num));
}
