import { AgonError, type AgonErrorBody } from "@agonx402/types";

/**
 * HTTP client for calling the Agon backend from the platform SDK.
 * Used internally by the core authorize/consume/release logic.
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
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.platformKey}`,
        },
        body: JSON.stringify(body),
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
