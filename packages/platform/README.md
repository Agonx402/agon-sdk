# @agonx402/platform

Merchant SDK for accepting Agon payments. Drop-in middleware for Next.js, Express, and Fastify that handles the authorize → serve → consume lifecycle automatically.

**[Full Documentation](https://docs.agonx402.com)** | **[GitHub](https://github.com/agonx402/agon-sdk)**

## Install

```bash
npm install @agonx402/platform
```

## Quick Start

### Next.js (App Router)

```ts
// app/api/premium/route.ts
import { withAgon } from '@agonx402/platform/next'

const handler = async (req: Request) => {
  return Response.json({ data: 'premium content' })
}

export const GET = withAgon(handler, {
  agonUrl: process.env.AGON_URL!,
  platformKey: process.env.AGON_PLATFORM_KEY!,
  pricing: '$0.001',
  description: 'Premium weather data',
})
```

### Express

```ts
import express from 'express'
import { agonMiddleware } from '@agonx402/platform/express'

const app = express()

app.use('/api/premium', agonMiddleware({
  agonUrl: process.env.AGON_URL!,
  platformKey: process.env.AGON_PLATFORM_KEY!,
  pricing: '$0.001',
}))

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'premium' })
})
```

### Fastify

```ts
import Fastify from 'fastify'
import { agonPlugin } from '@agonx402/platform/fastify'

const app = Fastify()

app.register(agonPlugin, {
  agonUrl: process.env.AGON_URL!,
  platformKey: process.env.AGON_PLATFORM_KEY!,
  pricing: '$0.001',
})

app.get('/api/premium/data', async () => {
  return { data: 'premium' }
})
```

### Dynamic Pricing

Price per request based on the incoming request:

```ts
export const POST = withAgon(handler, {
  agonUrl: process.env.AGON_URL!,
  platformKey: process.env.AGON_PLATFORM_KEY!,
  pricing: async (req) => {
    const body = await req.json()
    const tokens = body.maxTokens ?? 1000
    return BigInt(Math.ceil(tokens * 0.01) * 1_000_000) // $0.01 per 1k tokens
  },
  description: 'AI inference',
})
```

## How It Works

When a request arrives:

1. **Extract** the consumer's `X-AGON-TOKEN` header
2. **Calculate** the price (static or dynamic)
3. **Authorize** — forward the single-use token to Agon backend to reserve funds
4. **Serve** — run your route handler
5. **Consume** (on success) or **Release** (on failure) — finalize the reservation

The consumer sends a short-lived, single-use auth token (not their raw API key) — the merchant never sees `ak_xxx`. Each token can only authorize one reservation, preventing replay attacks. If no `X-AGON-TOKEN` is present, a `402 Payment Required` response is returned with instructions on how to pay.

If the consumer has spending limits that block the request and includes override headers (`X-AGON-OVERRIDE-SIG`, `X-AGON-OVERRIDE-MSG`), these are forwarded to Agon for wallet signature verification.

## Multi-Route Protection (Next.js)

```ts
import { agonProxy } from '@agonx402/platform/next'

export default agonProxy({
  agonUrl: process.env.AGON_URL!,
  platformKey: process.env.AGON_PLATFORM_KEY!,
  routes: {
    '/api/weather': { price: '$0.001', description: 'Weather data' },
    '/api/ai':      { price: '$0.01',  description: 'AI inference' },
  },
})
```

## Core Class (Custom Integrations)

For frameworks not covered above:

```ts
import { AgonPlatformCore, generateRequestId } from '@agonx402/platform'

const core = new AgonPlatformCore({
  agonUrl: 'https://api.agon.so',
  platformKey: 'pk_xxx',
  pricing: '$0.001',
})

// In your request handler:
const consumerToken = core.extractConsumerToken(req.headers)
const price = await core.calculatePrice(req)
const requestId = generateRequestId()
const override = core.extractOverride(req.headers)

const auth = await core.authorize(consumerToken, requestId, price, override)
if (auth.status === 'denied') { /* return 402 */ }

// ... serve request ...

await core.consume(auth.reservation_id!)
// or: await core.release(auth.reservation_id!) on failure
```

## Important Risk and Security Notice

AGON is an early-stage, devnet payment infrastructure project. It functions as a custodial service: after deposit, funds are swept to and held in project-controlled wallets.

While the core payment flows are operational, the platform is still under active development and has not yet undergone a formal security audit or obtained insurance coverage. The project is also in the process of completing VASP registration in Georgia.

As with any early-stage financial technology, there are material risks including (but not limited to) technical failures, operational errors, or unforeseen events that could result in loss of funds.

We strongly recommend testing with very small amounts only and monitoring your activity closely.

We are committed to transparency and continuous improvement — live Proof of Reserves, public multisig wallets, and regular updates are available on the site.

## License

MIT
