/**
 * @agonx402/platform — Merchant SDK for accepting Agon payments.
 *
 * Framework-specific integrations:
 * - Next.js:  import { withAgon, agonProxy } from '@agonx402/platform/next'
 * - Express:  import { agonMiddleware } from '@agonx402/platform/express'
 * - Fastify:  import { agonPlugin } from '@agonx402/platform/fastify'
 *
 * Or use the core class directly for custom integrations:
 */
export { AgonPlatformCore, generateRequestId } from "./core.js";
export { AgonHttpClient } from "./http.js";

// Re-export relevant types for convenience
export type {
  AgonPlatformConfig,
  AgonRouteConfig,
  AuthorizeResponse,
  ConsumeResponse,
  ReleaseResponse,
} from "@agonx402/types";
export { AgonError, parsePrice, AGON_HEADERS } from "@agonx402/types";
