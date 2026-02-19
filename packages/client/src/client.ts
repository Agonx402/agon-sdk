import { Connection, Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  type RegisterAccountResponse,
  type DepositResult,
  type WithdrawalResult,
  type AccountBalance,
  type SpendingControls,
  type OverrideSigner,
  type CreateTokenResponse,
  USDC,
  AGON_HEADERS,
  AgonError,
} from "@agonx402/types";
import { AgonHttpClient } from "./http.js";
import { sendUsdc, approveDelegate, revokeDelegate, usdcToUnits } from "./solana.js";

/**
 * Callback for when a spending limit is exceeded.
 *
 * Receives details about which limit was hit and the amount.
 * Return 'approve' to sign with the wallet and override.
 * Return 'reject' to throw an error.
 *
 * For AI agents: auto-approve up to a ceiling.
 * For interactive apps: show a confirmation dialog or open Privy popup.
 */
export type OnLimitExceeded = (details: {
  limitType: string;
  requested: number;
  limit: number;
  dailySpent?: number;
  merchantDomain?: string;
  signMessage?: string;
}) => Promise<"approve" | "reject"> | "approve" | "reject";

interface AgonClientKeypairConfig {
  baseUrl: string;
  /** Solana Keypair for on-chain operations and override signing */
  wallet: Keypair;
  solanaRpcUrl?: string;
  usdcMint?: string;
  apiKey?: string;
  timeout?: number;
  fetch?: typeof fetch;
  onLimitExceeded?: OnLimitExceeded;
  signer?: never;
}

interface AgonClientSignerConfig {
  baseUrl: string;
  /**
   * Custom override signer for environments without a Keypair (e.g. browser + Privy).
   * Called when a spending limit override needs to be signed.
   */
  signer: OverrideSigner;
  apiKey?: string;
  timeout?: number;
  fetch?: typeof fetch;
  onLimitExceeded?: OnLimitExceeded;
  wallet?: never;
  solanaRpcUrl?: never;
  usdcMint?: never;
}

export type AgonClientConstructor = AgonClientKeypairConfig | AgonClientSignerConfig;

export class AgonClient {
  private http: AgonHttpClient;
  private connection: Connection | null;
  private wallet: Keypair | null;
  private usdcMint: string;
  private apiKey: string | null = null;
  private accountId: string | null = null;
  private depositAddress: string | null = null;
  private fetchImpl: typeof fetch;
  private onLimitExceeded: OnLimitExceeded | null;
  private customSigner: OverrideSigner | null;

  constructor(config: AgonClientConstructor) {
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.onLimitExceeded = config.onLimitExceeded ?? null;

    if ("wallet" in config && config.wallet) {
      this.wallet = config.wallet;
      this.usdcMint = config.usdcMint ?? USDC.DEVNET_MINT;
      this.customSigner = null;
      this.connection = new Connection(
        config.solanaRpcUrl ?? "https://api.devnet.solana.com",
        { commitment: "confirmed" }
      );
    } else {
      this.wallet = null;
      this.usdcMint = USDC.DEVNET_MINT;
      this.customSigner = (config as AgonClientSignerConfig).signer;
      this.connection = null;
    }

    this.http = new AgonHttpClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout,
    });

    if (config.apiKey) {
      this.apiKey = config.apiKey;
    }
  }

  // ─── Account Management ─────────────────────────────────────────────────

  /**
   * Register a new Agon account. Requires Keypair mode.
   *
   * Creates an account, generates an HD-derived deposit address,
   * and returns a consumer API key. The API key is shown once and must be stored.
   */
  async register(): Promise<{ account: RegisterAccountResponse; apiKey: string }> {
    this.requireKeypair("register");

    const result = await this.http.post<any>("/account/register", {
      wallet_address: this.wallet!.publicKey.toBase58(),
    });

    this.apiKey = result.api_key;
    this.accountId = result.account_id;
    this.depositAddress = result.deposit_address;
    this.http.setApiKey(result.api_key);

    return {
      account: result,
      apiKey: result.api_key,
    };
  }

  /**
   * Get the current account info. Resolves from the API key — no account_id needed.
   *
   * This is the recommended way to initialize the client with an existing API key:
   * ```ts
   * const agon = new AgonClient({ baseUrl, wallet, apiKey: 'ak_xxx' })
   * const account = await agon.getAccount()
   * // agon.accountId, agon.depositAddress are now set internally
   * ```
   */
  async getAccount(): Promise<AccountBalance> {
    this.requireAuth();

    const result = await this.http.get<any>("/account/me");

    this.accountId = result.account_id;
    this.depositAddress = result.deposit_address;

    return {
      accountId: result.account_id,
      ownerWallet: result.wallet_address,
      depositAddress: result.deposit_address,
      balance: BigInt(result.balance),
      reservedBalance: BigInt(result.reserved_balance),
      consumedBalance: BigInt(result.consumed_balance),
      availableBalance: BigInt(result.available_balance),
      currency: "USDC",
      autoRefill: result.auto_refill,
    };
  }

  /**
   * Get the account balance. Requires accountId to be set
   * (via register(), getAccount(), or setAccountId()).
   */
  async getBalance(): Promise<AccountBalance> {
    this.requireAuth();
    this.requireAccountId();

    const result = await this.http.get<any>(`/account/${this.accountId}`);

    if (result.deposit_address) {
      this.depositAddress = result.deposit_address;
    }

    return {
      accountId: result.account_id,
      ownerWallet: result.wallet_address,
      depositAddress: result.deposit_address,
      balance: BigInt(result.balance),
      reservedBalance: BigInt(result.reserved_balance),
      consumedBalance: BigInt(result.consumed_balance),
      availableBalance: BigInt(result.available_balance),
      currency: "USDC",
      autoRefill: result.auto_refill,
    };
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.http.setApiKey(apiKey);
  }

  setAccountId(accountId: string): void {
    this.accountId = accountId;
  }

  setDepositAddress(address: string): void {
    this.depositAddress = address;
  }

  getAccountId(): string | null {
    return this.accountId;
  }

  getDepositAddress(): string | null {
    return this.depositAddress;
  }

  // ─── Spending Controls ──────────────────────────────────────────────────

  /**
   * Get the current spending control settings.
   */
  async getSpendingControls(): Promise<SpendingControls> {
    this.requireAuth();
    const result = await this.http.get<any>("/account/spending-controls");
    return {
      maxPerRequest: result.max_per_request,
      dailySpendingLimit: result.daily_spending_limit,
      dailySpent: result.daily_spent,
      dailyResetAt: result.daily_reset_at,
      proxyEnabled: result.proxy_enabled,
      proxyAllowedDomains: result.proxy_allowed_domains,
    };
  }

  /**
   * Update spending control settings. Partial update — only provided fields change.
   *
   * @example
   * await agon.setSpendingControls({
   *   maxPerRequest: 1_000_000,       // $1 max per request
   *   dailySpendingLimit: 50_000_000, // $50/day
   *   proxyEnabled: true,
   *   proxyAllowedDomains: ['api.openai.com', 'api.anthropic.com'],
   * })
   */
  async setSpendingControls(controls: {
    maxPerRequest?: number;
    dailySpendingLimit?: number;
    proxyEnabled?: boolean;
    proxyAllowedDomains?: string[] | null;
  }): Promise<SpendingControls> {
    this.requireAuth();

    const body: Record<string, unknown> = {};
    if (controls.maxPerRequest !== undefined) body.max_per_request = controls.maxPerRequest;
    if (controls.dailySpendingLimit !== undefined) body.daily_spending_limit = controls.dailySpendingLimit;
    if (controls.proxyEnabled !== undefined) body.proxy_enabled = controls.proxyEnabled;
    if (controls.proxyAllowedDomains !== undefined) body.proxy_allowed_domains = controls.proxyAllowedDomains;

    const result = await this.http.post<any>("/account/spending-controls", body);
    return {
      maxPerRequest: result.max_per_request,
      dailySpendingLimit: result.daily_spending_limit,
      dailySpent: result.daily_spent,
      dailyResetAt: result.daily_reset_at,
      proxyEnabled: result.proxy_enabled,
      proxyAllowedDomains: result.proxy_allowed_domains,
    };
  }

  // ─── Deposits & Withdrawals ─────────────────────────────────────────────

  /**
   * Deposit USDC on-chain and credit the account. Requires Keypair mode.
   *
   * @param amountUsdc - Amount in USDC (e.g. 10 for 10 USDC)
   */
  async deposit(amountUsdc: number): Promise<DepositResult> {
    this.requireKeypair("deposit");
    this.requireAuth();

    if (amountUsdc <= 0) {
      throw new AgonError(400, {
        error: "validation_error",
        message: "Deposit amount must be positive",
      });
    }

    if (!this.depositAddress) {
      throw new AgonError(400, {
        error: "validation_error",
        message: "Deposit address not set. Call register() or getAccount() first, or use setDepositAddress().",
      });
    }

    const amount = usdcToUnits(amountUsdc);

    const txSignature = await sendUsdc(
      this.connection!,
      this.wallet!,
      this.depositAddress,
      amount,
      this.usdcMint
    );

    const result = await this.http.post<any>("/account/deposit", {
      tx_signature: txSignature,
    });

    return {
      accountId: result.account_id,
      txSignature: result.tx_signature,
      depositAmount: BigInt(result.deposit_amount),
      balance: BigInt(result.balance),
      availableBalance: BigInt(result.available_balance),
      currency: "USDC",
    };
  }

  /**
   * Withdraw USDC from the account to the registered owner wallet.
   *
   * @param amountUsdc - Amount in USDC (e.g. 5 for 5 USDC)
   */
  async withdraw(amountUsdc: number): Promise<WithdrawalResult> {
    this.requireAuth();

    if (amountUsdc <= 0) {
      throw new AgonError(400, {
        error: "validation_error",
        message: "Withdrawal amount must be positive",
      });
    }

    const amount = usdcToUnits(amountUsdc);

    const result = await this.http.post<any>("/account/withdraw", {
      amount: Number(amount),
    });

    return {
      accountId: result.account_id,
      txSignature: result.tx_signature,
      withdrawnAmount: BigInt(result.withdrawn_amount),
      balance: BigInt(result.balance),
      availableBalance: BigInt(result.available_balance),
      currency: "USDC",
    };
  }

  // ─── Auto-Refill ────────────────────────────────────────────────────────

  /**
   * Configure auto-refill. Requires Keypair mode (needs on-chain SPL approval).
   *
   * When your balance drops below `threshold`, Agon will automatically pull
   * `replenishAmount` USDC from your wallet (up to `monthlyLimit` per month).
   */
  async setAutoRefill(cfg: {
    threshold: number;
    replenishAmount: number;
    monthlyLimit: number;
    approveAmount: number;
  }): Promise<void> {
    this.requireKeypair("setAutoRefill");
    this.requireAuth();

    if (!this.depositAddress) {
      throw new AgonError(400, {
        error: "validation_error",
        message: "Deposit address not set. Call register() or getAccount() first.",
      });
    }

    const approvedAmount = usdcToUnits(cfg.approveAmount);

    await approveDelegate(
      this.connection!,
      this.wallet!,
      this.depositAddress,
      approvedAmount,
      this.usdcMint
    );

    await this.http.post("/account/auto-refill", {
      approved_amount: Number(approvedAmount),
      threshold: Number(usdcToUnits(cfg.threshold)),
      replenish_amount: Number(usdcToUnits(cfg.replenishAmount)),
      monthly_limit: Number(usdcToUnits(cfg.monthlyLimit)),
    });
  }

  /**
   * Disable auto-refill and revoke the on-chain SPL delegation.
   */
  async revokeAutoRefill(): Promise<void> {
    this.requireKeypair("revokeAutoRefill");
    this.requireAuth();

    await this.http.post("/account/auto-refill/revoke", {});

    if (this.depositAddress) {
      await revokeDelegate(
        this.connection!,
        this.wallet!,
        this.depositAddress,
        this.usdcMint
      );
    }
  }

  // ─── API Key Management ─────────────────────────────────────────────────

  /**
   * Rotate the API key — revokes the current key and issues a new one.
   */
  async rotateKey(): Promise<{ apiKey: string }> {
    this.requireAuth();

    const result = await this.http.post<any>("/keys/rotate", {});
    this.apiKey = result.api_key;
    this.http.setApiKey(result.api_key);

    return { apiKey: result.api_key };
  }

  /**
   * Revoke the current API key without issuing a new one.
   */
  async revokeKey(): Promise<void> {
    this.requireAuth();
    await this.http.post("/keys/revoke", {});
    this.apiKey = null;
  }

  // ─── Consumer Auth Tokens ──────────────────────────────────────────────

  /**
   * Create a short-lived auth token for use with merchant APIs.
   *
   * Instead of sending your raw API key to a merchant, create a scoped
   * token and send that instead. The merchant forwards the token to
   * POST /authorize and Agon verifies its server-side signature.
   *
   * The merchant never sees your API key.
   *
   * @param opts.ttl - Token time-to-live in seconds (default 60, max 300).
   * @param opts.maxAmount - Maximum charge amount in USDC smallest units. If set, the merchant cannot charge more than this.
   * @returns The signed token string and its TTL.
   *
   * @example
   * const { token } = await agon.createAuthToken({ maxAmount: 1_000_000 }); // $1 cap
   * const res = await fetch('https://merchant.com/api', {
   *   headers: { 'X-AGON-TOKEN': token },
   * });
   */
  async createAuthToken(opts?: { ttl?: number; maxAmount?: number }): Promise<CreateTokenResponse> {
    this.requireAuth();
    return this.http.post<CreateTokenResponse>("/account/create-token", {
      ttl: opts?.ttl ?? 60,
      ...(opts?.maxAmount !== undefined ? { max_amount: opts.maxAmount } : {}),
    });
  }

  // ─── Paid Fetch ─────────────────────────────────────────────────────────

  /**
   * Make an HTTP request with automatic Agon payment handling.
   *
   * Works in both Keypair and Signer modes.
   *
   * Auto-detect flow:
   * 1. Creates a short-lived auth token and sends it as X-AGON-TOKEN
   *    (the merchant never sees the raw API key).
   * 2. If 2xx — Agon-native merchant handled the payment. Return response.
   * 3. If 402 with PAYMENT-REQUIRED header — standard x402, route through proxy.
   * 4. If 402 without PAYMENT-REQUIRED — Agon-specific error.
   *
   * Spending limit handling:
   * If a limit is exceeded and onLimitExceeded returns 'approve', the SDK
   * signs an override (via Keypair or custom signer) and retries.
   */
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    this.requireAuth();

    const { token } = await this.createAuthToken({});

    const headers = new Headers(init?.headers);
    headers.set(AGON_HEADERS.CONSUMER_TOKEN, token);

    const res = await this.fetchImpl(url, { ...init, headers });

    if (res.status !== 402) {
      return res;
    }

    const paymentRequired = res.headers.get(AGON_HEADERS.PAYMENT_REQUIRED);
    if (paymentRequired) {
      return this.proxyX402(url, init, paymentRequired);
    }

    let errorBody: any;
    try {
      errorBody = await res.json();
    } catch {
      throw new AgonError(402, {
        error: "insufficient_balance",
        message: "Payment required but no details available",
      });
    }

    const error = new AgonError(402, {
      error: errorBody.error ?? "insufficient_balance",
      message: errorBody.message ?? "Payment required",
      details: errorBody.details ?? errorBody.payment_info,
    });

    if (error.isSpendingLimitExceeded() && error.isOverrideAvailable()) {
      return this.handleSpendingLimitOverride(url, init, error);
    }

    throw error;
  }

  // ─── Private: Override Handling ──────────────────────────────────────────

  private async handleSpendingLimitOverride(
    url: string,
    init: RequestInit | undefined,
    error: AgonError
  ): Promise<Response> {
    if (!this.onLimitExceeded) {
      throw error;
    }

    const details = error.details;
    const signMsg = error.getOverrideSignMessage();

    const decision = await this.onLimitExceeded({
      limitType: details.limit_type as string,
      requested: details.requested as number,
      limit: details.limit as number,
      dailySpent: details.daily_spent as number | undefined,
      merchantDomain: details.merchant_domain as string | undefined,
      signMessage: signMsg ?? undefined,
    });

    if (decision !== "approve") {
      throw error;
    }

    if (!signMsg) {
      throw error;
    }

    const override = await this.signOverride(signMsg);

    const { token: retryToken } = await this.createAuthToken({});
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set(AGON_HEADERS.CONSUMER_TOKEN, retryToken);
    retryHeaders.set("X-AGON-OVERRIDE-SIG", override.signature);
    retryHeaders.set("X-AGON-OVERRIDE-MSG", override.message);

    const retryRes = await this.fetchImpl(url, { ...init, headers: retryHeaders });

    if (retryRes.status === 402) {
      let retryBody;
      try {
        retryBody = await retryRes.json();
      } catch {
        throw error;
      }
      throw new AgonError(402, {
        error: (retryBody as any).error ?? "spending_limit_exceeded",
        message: (retryBody as any).message ?? "Spending limit override failed",
        details: (retryBody as any).details,
      });
    }

    return retryRes;
  }

  // ─── Private: x402 Proxy ────────────────────────────────────────────────

  private async proxyX402(
    url: string,
    init: RequestInit | undefined,
    paymentRequired: string
  ): Promise<Response> {
    const paymentRequiredBase64 = toBase64(paymentRequired);
    const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    try {
      const proxyResult = await this.http.post<any>("/proxy", {
        url,
        method: init?.method ?? "GET",
        headers: extractHeaders(init),
        body: init?.body ? String(init.body) : undefined,
        payment_required: paymentRequiredBase64,
        request_id: requestId,
      });

      return new Response(proxyResult.body, {
        status: proxyResult.status,
        headers: proxyResult.headers ?? {},
      });
    } catch (err) {
      if (!(err instanceof AgonError)) throw err;

      if (!err.isSpendingLimitExceeded() || !err.isOverrideAvailable()) {
        throw err;
      }

      if (!this.onLimitExceeded) {
        throw err;
      }

      const details = err.details;
      const signMsg = err.getOverrideSignMessage();

      const decision = await this.onLimitExceeded({
        limitType: details.limit_type as string,
        requested: details.requested as number,
        limit: details.limit as number,
        dailySpent: details.daily_spent as number | undefined,
        merchantDomain: details.merchant_domain as string | undefined,
        signMessage: signMsg ?? undefined,
      });

      if (decision !== "approve") throw err;
      if (!signMsg) throw err;

      const override = await this.signOverride(signMsg);

      const retryResult = await this.http.post<any>("/proxy", {
        url,
        method: init?.method ?? "GET",
        headers: extractHeaders(init),
        body: init?.body ? String(init.body) : undefined,
        payment_required: paymentRequiredBase64,
        request_id: requestId,
        override: {
          signature: override.signature,
          message: override.message,
        },
      });

      return new Response(retryResult.body, {
        status: retryResult.status,
        headers: retryResult.headers ?? {},
      });
    }
  }

  // ─── Private: Signing ───────────────────────────────────────────────────

  private async signOverride(message: string): Promise<{ signature: string; message: string }> {
    if (this.customSigner) {
      return this.customSigner(message);
    }

    if (this.wallet) {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, this.wallet.secretKey);
      return { signature: bs58.encode(signatureBytes), message };
    }

    throw new AgonError(400, {
      error: "validation_error",
      message: "No signer available. Provide a wallet Keypair or a custom signer.",
    });
  }

  // ─── Private: Guards ────────────────────────────────────────────────────

  private requireAuth(): void {
    if (!this.apiKey) {
      throw new AgonError(401, {
        error: "invalid_api_key",
        message: "API key not set. Call register() first or setApiKey() with an existing key.",
      });
    }
  }

  private requireKeypair(method: string): void {
    if (!this.wallet) {
      throw new AgonError(400, {
        error: "validation_error",
        message: `${method}() requires a Keypair. Initialize AgonClient with { wallet: Keypair } instead of { signer }.`,
      });
    }
  }

  private requireAccountId(): void {
    if (!this.accountId) {
      throw new AgonError(400, {
        error: "validation_error",
        message: "Account ID not set. Call register(), getAccount(), or setAccountId() first.",
      });
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractHeaders(init: RequestInit | undefined): Record<string, string> | undefined {
  if (!init?.headers) return undefined;
  const h: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => { h[k] = v; });
  return h;
}

/**
 * Cross-environment base64 encode (works in both Node.js and browsers).
 */
function toBase64(str: string): string {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(str);
  }
  return Buffer.from(str).toString("base64");
}
