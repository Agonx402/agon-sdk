import { AgonError, type AgonErrorBody } from "@agonx402/types";

/**
 * HTTP client for calling the Agon backend from the platform SDK.
 * Used internally by the core authorize/consume/release/standardx logic.
 */
export class AgonHttpClient {
  private baseUrl: string;
  private platformKey: string;
  private timeout: number;

  constructor(config: {
    agonUrl: string;
    platformKey: string;
    timeout?: number;
  }) {
    this.baseUrl = config.agonUrl.replace(/\/$/, "");
    this.platformKey = config.platformKey;
    this.timeout = config.timeout ?? 5_000;
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

    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${this.platformKey}`,
        },
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
          message: `Agon API returned ${res.status}`,
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
        message: `Failed to reach Agon API: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
