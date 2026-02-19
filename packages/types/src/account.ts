/**
 * Account — represents a consumer's balance and settings within Agon.
 * One account per wallet address. All amounts in USDC smallest units (6 decimals).
 * 1 USDC = 1_000_000 units.
 */
export interface Account {
  accountId: string;
  ownerWallet: string;
  balance: bigint;
  reservedBalance: bigint;
  consumedBalance: bigint;
  createdAt: string;
  updatedAt: string;
  autoRefill: AutoRefillSettings | null;
}

export interface AccountBalance {
  accountId: string;
  ownerWallet: string;
  /** Unique HD-derived deposit address for this account */
  depositAddress: string;
  /** Total balance (includes reserved and consumed-unsettled) */
  balance: bigint;
  /** Funds currently reserved by active authorizations */
  reservedBalance: bigint;
  /** Funds consumed but not yet settled on-chain */
  consumedBalance: bigint;
  /** Funds available for new authorizations: balance - reservedBalance */
  availableBalance: bigint;
  currency: "USDC";
  autoRefill: AutoRefillSettings | null;
}

export interface AutoRefillSettings {
  active: boolean;
  /** Total USDC the consumer has approved Agon to transfer (on-chain SPL approval amount) */
  approvedAmount: bigint;
  /** Trigger refill when balance drops below this amount */
  threshold: bigint;
  /** Amount to deposit per refill */
  replenishAmount: bigint;
  /** Maximum auto-refill total per calendar month */
  monthlyLimit: bigint;
  /** Amount already auto-refilled this month */
  monthlyUsed: bigint;
}

export interface AutoRefillConfig {
  approvedAmount: bigint;
  threshold: bigint;
  replenishAmount: bigint;
  monthlyLimit: bigint;
}

export interface RegisterAccountRequest {
  walletAddress: string;
}

export interface RegisterAccountResponse {
  account: Account;
  /** Consumer API key — shown once, must be stored. Used as X-AGON-KEY header. */
  apiKey: string;
  /** Agon's wallet address where the consumer should send USDC deposits */
  depositAddress: string;
}

export interface DepositRequest {
  accountId: string;
  /** Solana transaction signature of the SPL transfer to Agon's wallet */
  txSignature: string;
}

export interface DepositResult {
  accountId: string;
  txSignature: string;
  depositAmount: bigint;
  balance: bigint;
  availableBalance: bigint;
  currency: "USDC";
}

export interface WithdrawRequest {
  accountId: string;
  /** Amount in USDC smallest units to withdraw */
  amount: bigint;
}

export interface WithdrawalResult {
  accountId: string;
  txSignature: string;
  withdrawnAmount: bigint;
  balance: bigint;
  availableBalance: bigint;
  currency: "USDC";
}

export interface SetAutoRefillRequest {
  accountId: string;
  approvedAmount: bigint;
  threshold: bigint;
  replenishAmount: bigint;
  monthlyLimit: bigint;
}
