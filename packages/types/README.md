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

## License

MIT
