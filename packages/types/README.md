# @agonx402/types

Shared TypeScript type definitions for the Agon payment protocol.

**[Full Documentation](https://docs.agonx402.com)** | **[GitHub](https://github.com/agonx402/agon-sdk)**

Used internally by `@agonx402/client` and `@agonx402/platform`. You typically don't need to install this directly — it's included as a dependency of both SDKs.

## Install

```bash
npm install @agonx402/types
```

## What's included

- **Account types** — `Account`, `AccountBalance`, `AutoRefillSettings`, deposit/withdrawal types
- **Reservation types** — `AuthorizeRequest/Response`, `ConsumeRequest/Response`, `ReleaseRequest/Response`
- **Spending controls** — `SpendingControls`, `SpendingOverride`, `SpendingLimitExceededDetails`
- **Platform types** — `ApiPlatform`, `RegisterPlatformRequest/Response`
- **Proxy types** — `ProxyRequest/Response` for x402 compatibility mode
- **Settlement types** — `Settlement`, `SettlementBatch` for batch on-chain payouts
- **Error types** — `AgonError` class with typed error codes and helper methods
- **Config types** — `AgonPlatformConfig`, `OverrideSigner`, pricing utilities
- **Constants** — `AGON_HEADERS`, `USDC` (mints, decimals), `parsePrice()`

## Conventions

- All monetary amounts are in **USDC smallest units** (6 decimals): `1 USDC = 1_000_000 units`
- All IDs are strings (UUIDs)
- All timestamps are ISO 8601 strings
- Wire format uses `snake_case`, SDK-facing types use `camelCase`

## Important Risk and Security Notice

AGON is an early-stage, devnet payment infrastructure project. It functions as a custodial service: after deposit, funds are swept to and held in project-controlled wallets.

While the core payment flows are operational, the platform is still under active development and has not yet undergone a formal security audit or obtained insurance coverage. The project is also in the process of completing VASP registration in Georgia.

As with any early-stage financial technology, there are material risks including (but not limited to) technical failures, operational errors, or unforeseen events that could result in loss of funds.

We strongly recommend testing with very small amounts only and monitoring your activity closely.

We are committed to transparency and continuous improvement — live Proof of Reserves, public multisig wallets, and regular updates are available on the site.

## License

MIT
