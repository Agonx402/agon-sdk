# @agonx402/client

Consumer SDK for the Agon payment protocol. Use this to register an account, deposit USDC, and make paid API calls to any merchant running `@agonx402/platform`.

**[Full Documentation](https://docs.agonx402.com)** | **[GitHub](https://github.com/agonx402/agon-sdk)**

## Install

```bash
npm install @agonx402/client
```

**Peer dependencies:** `@solana/web3.js` (only needed in Keypair mode)

## Quick Start

### Keypair mode (AI agents, servers)

```ts
import { AgonClient } from '@agonx402/client'
import { Keypair } from '@solana/web3.js'

const wallet = Keypair.fromSecretKey(/* your key */)
const agon = new AgonClient({
  baseUrl: 'https://api.agon.so',
  wallet,
})

// Register and deposit
const { apiKey } = await agon.register()
await agon.deposit(10) // 10 USDC

// Make paid API calls — payment is automatic
const res = await agon.fetch('https://merchant.com/api/premium')
const data = await res.json()
```

### Signer mode (browsers, Privy)

For environments without direct access to a Keypair (e.g. embedded wallets):

```ts
import { AgonClient } from '@agonx402/client'

const agon = new AgonClient({
  baseUrl: 'https://api.agon.so',
  apiKey: 'ak_xxx', // from dashboard or previous registration
  signer: async (message) => {
    // Use Privy, Phantom, or any wallet to sign
    const signature = await myWallet.signMessage(message)
    return { signature, message }
  },
})

// Discover account info from the API key
const account = await agon.getAccount()

// Make paid API calls
const res = await agon.fetch('https://merchant.com/api/data')
```

## Spending Controls

Set limits to protect against excessive spending:

```ts
await agon.setSpendingControls({
  maxPerRequest: 1_000_000,       // $1 max per request
  dailySpendingLimit: 50_000_000, // $50/day
  proxyEnabled: true,
  proxyAllowedDomains: ['api.openai.com'],
})
```

When a limit is exceeded, the SDK can auto-override with a wallet signature:

```ts
const agon = new AgonClient({
  baseUrl: 'https://api.agon.so',
  wallet,
  apiKey: 'ak_xxx',
  onLimitExceeded: async (details) => {
    if (details.requested < 5_000_000) return 'approve' // auto-approve under $5
    return 'reject'
  },
})
```

## Auto-Refill

Keep your balance topped up automatically:

```ts
await agon.setAutoRefill({
  threshold: 5,        // Refill when balance drops below $5
  replenishAmount: 20, // Add $20 per refill
  monthlyLimit: 100,   // Max $100/month in auto-refills
  approveAmount: 100,  // On-chain SPL approval amount
})
```

## Auth Tokens

When calling merchant APIs, the SDK automatically creates a short-lived auth token
(`X-AGON-TOKEN`) instead of exposing the raw API key. The merchant never sees `ak_xxx`.

You can also create tokens manually for custom integrations:

```ts
const { token, expires_in } = await agon.createAuthToken({ maxAmount: 1_000_000, budget: 5_000_000 })
// Use token in X-AGON-TOKEN header when calling a merchant
// maxAmount caps the charge at $1 per request
// budget caps the total cumulative spend for this multi-use token at $5
```

Tokens are signed by the Agon server and expire in 60 seconds (configurable up to 5 min). By default, they are **single-use** (consumed on the first `/authorize`). If you provide a `budget`, they become multi-use until the spend ceiling is hit. The `agon.fetch()` method creates a fresh single-use token automatically piece of the request.

## API Reference

| Method | Mode | Description |
|--------|------|-------------|
| `register()` | Keypair | Create account, get API key and deposit address |
| `registerAgent({ betaToken? })` | Keypair | Create an AI agent account using Native Ed25519 signatures |
| `createAuthToken({ ttl?, maxAmount?, budget? })` | Both | Create a short-lived token (single-use or multi-use if budget is set) |
| `getAccount()` | Both | Get account info from API key (sets accountId internally) |
| `getBalance()` | Both | Get current balance (requires accountId) |
| `deposit(amountUsdc)` | Keypair | Send USDC on-chain and credit the account |
| `withdraw(amountUsdc)` | Both | Withdraw USDC to owner wallet |
| `setSpendingControls(...)` | Both | Update spending limits |
| `getSpendingControls()` | Both | Get current spending limits |
| `setAutoRefill(...)` | Keypair | Configure auto-refill with on-chain approval |
| `revokeAutoRefill()` | Keypair | Disable auto-refill and revoke delegation |
| `fetch(url, init?)` | Both | HTTP request with automatic payment (uses auth tokens) |
| `rotateKey()` | Both | Revoke current key and get a new one |
| `revokeKey()` | Both | Revoke the current API key |

## Important Risk and Security Notice

AGON is an early-stage, devnet payment infrastructure project. It functions as a custodial service: after deposit, funds are swept to and held in project-controlled wallets.

While the core payment flows are operational, the platform is still under active development and has not yet undergone a formal security audit or obtained insurance coverage. The project is also in the process of completing VASP registration in Georgia.

As with any early-stage financial technology, there are material risks including (but not limited to) technical failures, operational errors, or unforeseen events that could result in loss of funds.

We strongly recommend testing with very small amounts only and monitoring your activity closely.

We are committed to transparency and continuous improvement — live Proof of Reserves, public multisig wallets, and regular updates are available on the site.

## License

MIT
