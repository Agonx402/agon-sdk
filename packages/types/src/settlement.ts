/**
 * Settlement — represents a batch on-chain payment from Agon to a merchant.
 *
 * Multiple consumed reservations are aggregated into a single settlement.
 * One Solana transaction can settle up to ~20 merchants (legacy) or ~55 (with ALTs).
 */

export type SettlementStatus = "pending" | "processing" | "completed" | "failed";

export interface Settlement {
  settlementId: string;
  platformId: string;
  /** Total USDC amount being settled to this merchant */
  amount: bigint;
  status: SettlementStatus;
  /** Solana transaction signature (set after on-chain confirmation) */
  txSignature: string | null;
  /** Number of individual reservations included in this settlement */
  reservationCount: number;
  createdAt: string;
  settledAt: string | null;
  retryCount: number;
}

export interface SettlementBatch {
  /** All settlements in this batch (one per merchant) */
  settlements: Settlement[];
  /** Single Solana transaction signature covering all settlements in the batch */
  txSignature: string | null;
  totalAmount: bigint;
  platformCount: number;
}
