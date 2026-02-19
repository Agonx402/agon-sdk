# Agon SDK

TypeScript SDKs for the [Agon](https://agon.so) payment layer — deposit USDC once, pay for any API, settle on-chain in batches.

**[Full Documentation](https://docs.agonx402.com)**

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@agonx402/types`](packages/types) | Shared types and constants | `npm i @agonx402/types` |
| [`@agonx402/client`](packages/client) | Consumer SDK — deposit, fetch, withdraw | `npm i @agonx402/client` |
| [`@agonx402/platform`](packages/platform) | Platform SDK — Express/Fastify/Next.js middleware | `npm i @agonx402/platform` |

## Quick start

**Consumer** — pay for APIs:

```ts
import { AgonClient } from '@agonx402/client'

const agon = new AgonClient({
  baseUrl: 'https://api.agon.so',
  apiKey: 'ak_live_xxx',
  wallet: myKeypair,
})

const res = await agon.fetch('https://api.example.com/data')
```

**Platform** — get paid for APIs:

```ts
import { agonMiddleware } from '@agonx402/platform/express'

app.use(agonMiddleware({
  agonUrl: 'https://api.agon.so',
  platformKey: 'pk_xxx',
  pricing: (req) => 1000, // 0.001 USDC
}))
```

## How it works

1. Consumer deposits USDC to Agon (one on-chain transaction)
2. Consumer calls APIs using `agon.fetch()` — payments are authorized off-chain in ~5ms
3. Agon settles to platforms in batches — one on-chain transaction for thousands of calls

Compatible with the [x402](https://x402.org) HTTP payment standard.

## License

MIT
