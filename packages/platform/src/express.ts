import { type AgonPlatformConfig, AgonError } from "@agonx402/types";
import { AgonPlatformCore, generateRequestId } from "./core.js";

/**
 * Express/Connect-style middleware for Agon payments.
 *
 * Usage:
 * ```ts
 * import { agonMiddleware } from '@agonx402/platform/express'
 *
 * app.use('/api/premium', agonMiddleware({
 *   agonUrl: 'https://api.agon.so',
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   pricing: '$0.001',
 * }))
 *
 * app.get('/api/premium/data', (req, res) => {
 *   res.json({ data: 'premium' })
 * })
 * ```
 */
export function agonMiddleware(config: AgonPlatformConfig) {
  const core = new AgonPlatformCore(config);

  return async (req: any, res: any, next: any) => {
    const consumerToken = core.extractConsumerToken(req.headers ?? {});

    let price: bigint;
    try {
      price = await core.calculatePrice(req);
    } catch {
      res.status(500).json({ error: "internal_error", message: "Failed to calculate price" });
      return;
    }

    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);
      res.status(status).json(body);
      return;
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(req.headers ?? {});
    let authResult;

    try {
      authResult = await core.authorize(consumerToken, requestId, price, override);
    } catch (err) {
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
        core.consume(reservationId).catch(() => {});
      } else {
        core.release(reservationId).catch(() => {});
      }
    };

    next();
  };
}
