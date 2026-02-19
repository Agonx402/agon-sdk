/**
 * @agonx402/client — Consumer SDK for the Agon payment protocol.
 *
 * Usage:
 * ```ts
 * import { AgonClient } from '@agonx402/client'
 * import { Keypair } from '@solana/web3.js'
 *
 * const wallet = Keypair.generate()
 * const agon = new AgonClient({ baseUrl: 'https://api.agon.so', wallet })
 *
 * // Register, deposit, and start making paid API calls
 * const { apiKey } = await agon.register()
 * await agon.deposit(10) // 10 USDC
 * const res = await agon.fetch('https://merchant.com/api/premium')
 * ```
 */
export { AgonClient } from "./client.js";
export type { OnLimitExceeded, AgonClientConstructor } from "./client.js";
export { AgonHttpClient } from "./http.js";
export { sendUsdc, approveDelegate, revokeDelegate, usdcToUnits, unitsToUsdc } from "./solana.js";

// Re-export commonly used types
export type {
  AccountBalance,
  DepositResult,
  WithdrawalResult,
  AutoRefillConfig,
  RegisterAccountResponse,
  SpendingControls,
  SetSpendingControlsRequest,
  SpendingOverride,
  SpendingLimitExceededDetails,
  OverrideSigner,
  CreateTokenResponse,
} from "@agonx402/types";
export { AgonError, AGON_HEADERS, USDC } from "@agonx402/types";
