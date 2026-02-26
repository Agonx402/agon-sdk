import { type AgonPlatformConfig, type AgonRouteConfig, AgonError } from "@agonx402/types";
import { AgonPlatformCore, generateRequestId } from "./core.js";

type NextRequest = Request;
type NextResponse = Response;
type NextHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * withAgon — Next.js App Router route wrapper.
 *
 * Wraps a Next.js route handler with Agon payment middleware.
 * Extracts X-AGON-TOKEN, authorizes, serves, then consumes or releases.
 *
 * Usage:
 * ```ts
 * import { withAgon } from '@agonx402/platform/next'
 *
 * const handler = async (req: Request) => {
 *   return Response.json({ data: 'premium content' })
 * }
 *
 * export const GET = withAgon(handler, {
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   price: '$0.001',
 *   agonUrl: 'https://api.agon.so',
 *   description: 'Premium weather data',
 * })
 * ```
 */
export function withAgon(
  handler: NextHandler,
  config: AgonRouteConfig & { agonUrl: string }
): NextHandler {
  const core = new AgonPlatformCore({
    agonUrl: config.agonUrl,
    platformKey: config.platformKey,
    pricing: config.pricing,
    description: config.description,
    mimeType: config.mimeType,
  });

  return async (req: NextRequest): Promise<NextResponse> => {
    const headerObj: Record<string, string> = {};
    req.headers.forEach((value, key) => { headerObj[key] = value; });
    const consumerToken = core.extractConsumerToken(headerObj);

    let price: bigint;
    try {
      price = await core.calculatePrice(req);
    } catch (err) {
      return Response.json(
        { error: "internal_error", message: "Failed to calculate price" },
        { status: 500 }
      );
    }

    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);
      return Response.json(body, { status });
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(headerObj);
    let authResult;

    try {
      authResult = await core.authorize(consumerToken, requestId, price, override);
    } catch (err: any) {
      if (err instanceof AgonError) {
        return Response.json(err.toJSON(), { status: err.statusCode });
      }
      return Response.json(
        { error: "internal_error", message: "Payment authorization failed" },
        { status: 502 }
      );
    }

    if (authResult.status === "denied") {
      const { body } = core.buildPaymentRequiredResponse(price);
      return Response.json(
        { ...body, denial_reason: authResult.reason },
        { status: 402 }
      );
    }

    const reservationId = authResult.reservation_id!;

    let response: NextResponse;
    try {
      response = await handler(req);
    } catch (err) {
      try {
        await core.release(reservationId);
      } catch {
        // Best effort release
      }
      return Response.json(
        { error: "internal_error", message: "Handler error" },
        { status: 500 }
      );
    }

    if (response.status < 400) {
      try {
        await core.consume(reservationId);
      } catch {
        // Consumption failed — the reservation will expire and auto-release
      }
    } else {
      try {
        await core.release(reservationId);
      } catch {
        // Best effort release
      }
    }

    return response;
  };
}

/**
 * agonProxy — Next.js App Router middleware-style function.
 *
 * Can be used in a catch-all route or route group to protect
 * all routes underneath.
 *
 * Usage in proxy.ts or middleware.ts:
 * ```ts
 * import { agonProxy } from '@agonx402/platform/next'
 *
 * export default agonProxy({
 *   agonUrl: 'https://api.agon.so',
 *   platformKey: process.env.AGON_PLATFORM_KEY!,
 *   routes: {
 *     '/api/weather': { price: '$0.001', description: 'Weather data' },
 *     '/api/ai': { price: '$0.01', description: 'AI inference' },
 *   },
 * })
 * ```
 */
export function agonProxy(config: {
  agonUrl: string;
  platformKey: string;
  routes: Record<string, { price: string | number; description?: string }>;
}): (req: NextRequest) => Promise<NextResponse | null> {
  const cores = new Map<string, { core: AgonPlatformCore; price: string | number }>();

  for (const [path, routeConfig] of Object.entries(config.routes)) {
    cores.set(path, {
      core: new AgonPlatformCore({
        agonUrl: config.agonUrl,
        platformKey: config.platformKey,
        pricing: routeConfig.price,
        description: routeConfig.description,
      }),
      price: routeConfig.price,
    });
  }

  return async (req: NextRequest): Promise<NextResponse | null> => {
    const url = new URL(req.url);
    const entry = cores.get(url.pathname);

    if (!entry) return null;

    const { core } = entry;
    const hdrObj: Record<string, string> = {};
    req.headers.forEach((value, key) => { hdrObj[key] = value; });
    const consumerToken = core.extractConsumerToken(hdrObj);

    const price = await core.calculatePrice(req);

    if (!consumerToken) {
      const { status, body } = core.buildPaymentRequiredResponse(price);
      return Response.json(body, { status }) as NextResponse;
    }

    const requestId = generateRequestId();
    const override = core.extractOverride(hdrObj);

    try {
      const authResult = await core.authorize(consumerToken, requestId, price, override);

      if (authResult.status === "denied") {
        const { body } = core.buildPaymentRequiredResponse(price);
        return Response.json(
          { ...body, denial_reason: authResult.reason },
          { status: 402 }
        ) as NextResponse;
      }

      return null;
    } catch (err: any) {
      if (err instanceof AgonError) {
        return Response.json(err.toJSON(), { status: err.statusCode }) as NextResponse;
      }
      return Response.json(
        { error: "internal_error", message: "Payment authorization failed" },
        { status: 502 }
      ) as NextResponse;
    }
  };
}
