import { type AgonPlatformConfig, AGON_HEADERS, AgonError } from "@agonx402/types";
import { AgonPlatformCore, generateRequestId } from "./core.js";

/**
 * Express/Connect-style middleware for Agon payments.
 *
 * Supports both Agon-native and standardx (standard x402) buyers:
 *
 * - Agon-native: consumer sends X-AGON-TOKEN. Off-chain, no Solana latency.
 * - StandardX: any standard x402 buyer sends PAYMENT-SIGNATURE. Agon co-signs
 *   and broadcasts on-chain. Enable with `legacyX402Enabled: true` in config.
 *
 * Usage:
 * ```ts
 * import { agonMiddleware } from '@agonx402/platform/express'
 *
 * app.use('/api/premium', agonMiddleware({
 *   agonUrl: 'https://api.agonx402.com',
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   pricing: '$0.001',
 *   // Optional: accept standard x402 buyers too
 *   legacyX402Enabled: true,
 * }))
 * ```
 */
export function agonMiddleware(config: AgonPlatformConfig) {
  const core = new AgonPlatformCore(config);

  return async (req: any, res: any, next: any) => {
    let price: bigint;
    try {
      price = await core.calculatePrice(req);
    } catch {
      res.status(500).json({ error: "internal_error", message: "Failed to calculate price" });
      return;
    }

    const headers = req.headers ?? {};

    // --- StandardX buyer path (standard x402) ---
    const paymentSignature = core.extractPaymentSignature(headers);
    if (paymentSignature) {
      let paymentRequiredHeader: string;
      try {
        const protocol = req.protocol ?? "https";
        const host = req.get?.("host") ?? req.hostname ?? "localhost";
        const resource = `${protocol}://${host}${req.originalUrl ?? req.url}`;
        paymentRequiredHeader = await core.buildStandardxPaymentRequiredHeader(price, resource);

      } catch (err: any) {
        res.status(502).json({ error: "internal_error", message: "Failed to resolve merchant wallet" });
        return;
      }

      try {
        const result = await core.sponsorStandardxTx(paymentSignature, paymentRequiredHeader, price);
        res.setHeader(AGON_HEADERS.PAYMENT_RESPONSE, Buffer.from(JSON.stringify(result)).toString("base64"));
        req.agonStandardxTxSignature = result.tx_signature;
        next(); // continue to route handler
      } catch (err: any) {
        if (err instanceof AgonError) {
          res.status(err.statusCode).json(err.toJSON());
          return;
        }
        res.status(502).json({ error: "sponsor_failed", message: "Failed to sponsor x402 transaction" });
      }
      return;
    }

    // --- Agon-native buyer path ---
    const consumerToken = core.extractConsumerToken(headers);
    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);

      // Emit PAYMENT-REQUIRED header for standard x402 buyers (always enabled)
      try {
        const protocol = req.protocol ?? "https";
        const host = req.get?.('host') ?? req.hostname ?? 'localhost';
        const resource = `${protocol}://${host}${req.originalUrl ?? req.url}`;
        const legacyHeader = await core.buildStandardxPaymentRequiredHeader(price, resource);
        res.setHeader(AGON_HEADERS.PAYMENT_REQUIRED, legacyHeader);
      } catch {
        // Non-fatal
      }

      res.status(status).json(body);
      return;
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(headers);
    let authResult;

    try {
      authResult = await core.authorize(consumerToken, requestId, price, override);
    } catch (err: any) {
      if (err instanceof AgonError) {
        res.status(err.statusCode).json(err.toJSON());
        return;
      }
      res.status(502).json({ error: "internal_error", message: "Payment authorization failed" });
      return;
    }

    if (authResult.status === "denied") {
      const { body } = core.buildPaymentRequiredResponse(price);
      res.status(402).json({ ...body, denial_reason: authResult.reason });
      return;
    }

    const reservationId = authResult.reservation_id!;
    req.agonReservationId = reservationId;

    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      originalEnd.apply(res, args);

      if (res.statusCode < 400) {
        core.consume(reservationId).catch(() => { });
      } else {
        core.release(reservationId).catch(() => { });
      }
    };

    next();
  };
}
