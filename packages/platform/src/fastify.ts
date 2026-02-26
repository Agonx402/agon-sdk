import { type AgonPlatformConfig, AgonError } from "@agonx402/types";
import { AgonPlatformCore, generateRequestId } from "./core.js";

/**
 * Fastify plugin for Agon payments.
 *
 * Usage:
 * ```ts
 * import { agonPlugin } from '@agonx402/platform/fastify'
 *
 * app.register(agonPlugin, {
 *   agonUrl: 'https://api.agon.so',
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   pricing: '$0.001',
 *   prefix: '/api/premium',
 * })
 *
 * app.get('/api/premium/data', async () => {
 *   return { data: 'premium' }
 * })
 * ```
 */
export function agonPlugin(
  fastify: any,
  opts: AgonPlatformConfig & { prefix?: string },
  done: () => void
) {
  const core = new AgonPlatformCore(opts);

  fastify.addHook("preHandler", async (request: any, reply: any) => {
    const consumerToken = core.extractConsumerToken(request.headers ?? {});

    let price: bigint;
    try {
      price = await core.calculatePrice(request);
    } catch {
      reply.status(500).send({ error: "internal_error", message: "Failed to calculate price" });
      return;
    }

    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);
      reply.status(status).send(body);
      return;
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(request.headers ?? {});
    let authResult;

    try {
      authResult = await core.authorize(consumerToken, requestId, price, override);
    } catch (err: any) {
      if (err instanceof AgonError) {
        reply.status(err.statusCode).send(err.toJSON());
        return;
      }
      reply.status(502).send({ error: "internal_error", message: "Payment authorization failed" });
      return;
    }

    if (authResult.status === "denied") {
      const { body } = core.buildPaymentRequiredResponse(price);
      reply.status(402).send({ ...body, denial_reason: authResult.reason });
      return;
    }

    request.agonReservationId = authResult.reservation_id;
  });

  fastify.addHook("onResponse", async (request: any, reply: any) => {
    const reservationId = request.agonReservationId;
    if (!reservationId) return;

    if (reply.statusCode < 400) {
      core.consume(reservationId).catch(() => { });
    } else {
      core.release(reservationId).catch(() => { });
    }
  });

  done();
}
