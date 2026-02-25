import { AgonError, type AgonErrorBody } from "@agonx402/types";
import type { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * HTTP client for calling the Agon backend from the consumer SDK.
 */
export class AgonHttpClient {
  private baseUrl: string;
  private apiKey: string | null;
  private wallet: Keypair | null;
  private timeout: number;
  private fetchImpl: typeof fetch;

  constructor(config: {
    baseUrl: string;
    apiKey?: string;
    wallet?: Keypair | null;
    timeout?: number;
    fetch?: typeof fetch;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey ?? null;
    this.wallet = config.wallet ?? null;
    this.timeout = config.timeout ?? 10_000;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["X-AGON-KEY"] = this.apiKey;
    } else if (this.wallet) {
      const timestamp = Date.now();
      const messageStr = `agon:auth:${timestamp}`;
      const messageBytes = new TextEncoder().encode(messageStr);
      const signatureBytes = nacl.sign.detached(messageBytes, this.wallet.secretKey);

      headers["X-AGON-WALLET"] = this.wallet.publicKey.toBase58();
      headers["X-AGON-SIGNATURE"] = bs58.encode(signatureBytes);
      headers["X-AGON-TIMESTAMP"] = timestamp.toString();
    }

    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json() as any;

      if (!res.ok) {
        if (data.error) {
          throw new AgonError(res.status, data as AgonErrorBody);
        }
        throw new AgonError(res.status, {
          error: "internal_error",
          message: `Agon API returned ${res.status}: ${JSON.stringify(data)}`,
        });
      }

      return data as T;
    } catch (err) {
      if (err instanceof AgonError) throw err;

      if (err instanceof DOMException && err.name === "AbortError") {
        throw new AgonError(504, {
          error: "internal_error",
          message: `Agon API request timed out after ${this.timeout}ms`,
        });
      }

      throw new AgonError(502, {
        error: "internal_error",
        message: `Failed to reach Agon API at ${url}: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
