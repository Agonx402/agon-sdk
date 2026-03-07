import { type AgonPlatformConfig, AGON_HEADERS, AgonError } from "@agonx402/types";
import { AgonPlatformCore, generateRequestId } from "./core.js";

/**
 * Fastify plugin for Agon payments.
 *
 * Supports both Agon-native and standardx (standard x402) buyers:
 *
 * - Agon-native: consumer sends X-AGON-TOKEN. Off-chain, no Solana latency.
 * - StandardX: any standard x402 buyer sends PAYMENT-SIGNATURE. Agon co-signs
 *   and broadcasts on-chain. Enable with `legacyX402Enabled: true` in config.
 *
 * Usage:
 * ```ts
 * import { agonPlugin } from '@agonx402/platform/fastify'
 *
 * app.register(agonPlugin, {
 *   agonUrl: 'https://api.agonx402.com',
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   pricing: '$0.001',
 *   // Optional: accept standard x402 buyers too
 *   legacyX402Enabled: true,
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
    let price: bigint;
    try {
      price = await core.calculatePrice(request);
    } catch {
      reply.status(500).send({ error: "internal_error", message: "Failed to calculate price" });
      return;
    }

    const headers = request.headers ?? {};

    // --- StandardX buyer path (standard x402) ---
    const paymentSignature = core.extractPaymentSignature(headers);
    if (paymentSignature) {
      // We need the PAYMENT-REQUIRED header value too (the buyer originally received it).
      // The buyer should echo it back in X-PAYMENT-REQUIRED or we reconstruct it.
      // Per x402 spec, merchant has PaymentRequirements — we rebuild it from our config.
      let paymentRequiredHeader: string;
      try {
        const resource = `${request.protocol}://${request.hostname}${request.url}`;
        paymentRequiredHeader = await core.buildStandardxPaymentRequiredHeader(price, resource);
      } catch (err: any) {
        reply.status(502).send({ error: "internal_error", message: "Failed to resolve merchant wallet" });
        return;
      }

      try {
        const result = await core.sponsorStandardxTx(paymentSignature, paymentRequiredHeader, price);
        // Mark the request as standardx-settled so the onResponse hook skips consume/release
        request.agonStandardxTxSignature = result.tx_signature;
        reply.header(AGON_HEADERS.PAYMENT_RESPONSE, Buffer.from(JSON.stringify(result)).toString("base64"));
        return; // continue to route handler
      } catch (err: any) {
        if (err instanceof AgonError) {
          reply.status(err.statusCode).send(err.toJSON());
          return;
        }
        reply.status(502).send({ error: "sponsor_failed", message: "Failed to sponsor x402 transaction" });
        return;
      }
    }

    // --- Agon-native buyer path ---
    const consumerToken = core.extractConsumerToken(headers);
    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);
      const responseHeaders: Record<string, string> = {};

      // Emit PAYMENT-REQUIRED header for standardx (standard x402) buyers (always enabled)
      try {
        const resource = `${request.protocol}://${request.hostname}${request.url}`;
        const legacyHeader = await core.buildStandardxPaymentRequiredHeader(price, resource);
        responseHeaders[AGON_HEADERS.PAYMENT_REQUIRED] = legacyHeader;
      } catch {
        // Non-fatal: still send the Agon-native 402 body
      }

      reply.status(status).headers(responseHeaders).send(body);
      return;
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(headers);
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
    // StandardX payments are settled on-chain — no reservation to consume/release
    if (request.agonStandardxTxSignature) return;

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
