import type { RawVkEvent } from "./types.js";

export interface VkLongPollCursor {
  server: string;
  key: string;
  ts: string;
}

export interface VkLongPollClientOptions {
  groupId: number;
  apiVersion: string;
  groupToken: string;
  fetchFn: typeof fetch;
  onEvent(event: RawVkEvent): Promise<void> | void;
  onCursor?(cursor: VkLongPollCursor | null): Promise<void> | void;
  initialCursor?: VkLongPollCursor | null;
  waitSeconds?: number;
  requestTimeoutMs?: number;
  logger?: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

export interface VkLongPollIterationResult {
  updates: number;
  recovered?: "ts" | "credentials";
}

export class VkLongPollClient {
  private cursor: VkLongPollCursor | null;
  private stopped = false;
  private abortController: AbortController | null = null;
  private readonly waitSeconds: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: VkLongPollClientOptions) {
    this.cursor = options.initialCursor ?? null;
    this.waitSeconds = options.waitSeconds ?? 25;
    this.requestTimeoutMs = options.requestTimeoutMs ?? (this.waitSeconds + 10) * 1000;
  }

  public async pollOnce(): Promise<VkLongPollIterationResult> {
    if (this.stopped) {
      return { updates: 0 };
    }

    if (!this.cursor) {
      this.cursor = await this.fetchServerCredentials();
      await this.options.onCursor?.(this.cursor);
    }

    const response = await this.fetchJson(this.buildPollUrl(this.cursor));
    const failed = Number(response.failed || 0);

    if (failed === 1) {
      const ts = String(response.ts ?? "");
      if (!ts) {
        throw new Error("VK Long Poll failed=1 response did not include ts");
      }
      this.cursor = { ...this.cursor, ts };
      await this.options.onCursor?.(this.cursor);
      return { updates: 0, recovered: "ts" };
    }

    if (failed === 2 || failed === 3) {
      this.cursor = null;
      await this.options.onCursor?.(null);
      return { updates: 0, recovered: "credentials" };
    }

    if (failed !== 0) {
      throw new Error(`Unsupported VK Long Poll failed code: ${failed}`);
    }

    const ts = String(response.ts ?? "");
    if (!ts) {
      throw new Error("VK Long Poll response did not include ts");
    }

    const updates = Array.isArray(response.updates)
      ? (response.updates as RawVkEvent[])
      : [];

    // Advance cursor before processing events: duplicates are handled by journal/dedupe.
    this.cursor = { ...this.cursor, ts };
    await this.options.onCursor?.(this.cursor);

    for (const event of updates) {
      await this.options.onEvent(event);
    }

    return { updates: updates.length };
  }

  public async start(): Promise<void> {
    this.stopped = false;
    while (!this.stopped) {
      try {
        await this.pollOnce();
      } catch (error) {
        if (this.stopped || (error instanceof Error && error.name === "AbortError")) {
          break;
        }
        this.options.logger?.error(
          `VK Long Poll iteration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  public stop(): void {
    this.stopped = true;
    this.abortController?.abort();
  }

  public getCursor(): VkLongPollCursor | null {
    return this.cursor ? { ...this.cursor } : null;
  }

  private async fetchServerCredentials(): Promise<VkLongPollCursor> {
    const url = new URL("https://api.vk.com/method/groups.getLongPollServer");
    url.searchParams.set("group_id", String(this.options.groupId));
    url.searchParams.set("access_token", this.options.groupToken);
    url.searchParams.set("v", this.options.apiVersion);

    const body = await this.fetchJson(url.toString());
    if (body.error) {
      const code = (body.error as Record<string, unknown>).error_code;
      throw new Error(`VK groups.getLongPollServer failed${code ? ` with code ${code}` : ""}`);
    }

    const response = body.response as Record<string, unknown> | undefined;
    const server = typeof response?.server === "string" ? response.server : "";
    const key = typeof response?.key === "string" ? response.key : "";
    const ts = response?.ts !== undefined ? String(response.ts) : "";

    if (!server || !key || !ts) {
      throw new Error("VK groups.getLongPollServer returned incomplete credentials");
    }

    return { server, key, ts };
  }

  private buildPollUrl(cursor: VkLongPollCursor): string {
    const url = new URL(cursor.server);
    url.searchParams.set("act", "a_check");
    url.searchParams.set("key", cursor.key);
    url.searchParams.set("ts", cursor.ts);
    url.searchParams.set("wait", String(this.waitSeconds));
    return url.toString();
  }

  private async fetchJson(url: string): Promise<Record<string, unknown>> {
    this.abortController = new AbortController();
    const timeout = setTimeout(() => this.abortController?.abort(), this.requestTimeoutMs);

    try {
      const response = await this.options.fetchFn(url, {
        method: "GET",
        signal: this.abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`VK Long Poll HTTP ${response.status}`);
      }
      const body = await response.json();
      if (!body || typeof body !== "object") {
        throw new Error("VK Long Poll returned invalid JSON");
      }
      return body as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
      this.abortController = null;
    }
  }
}
