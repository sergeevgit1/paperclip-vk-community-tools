import { sanitizeVkError, validateUploadUrl } from "./security.js";
import type { VkApiParams, VkCaller, VkPluginConfig, VkTokenType } from "./types.js";

export interface VkApiClientOptions {
  fetchFn?: typeof fetch;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  binaryMultipartSupported?: boolean;
}

export class VkApiError extends Error {
  readonly errorCode: number;
  readonly errorMsg: string;

  constructor(code: number, msg: string) {
    super(sanitizeVkError(`VK API Error ${code}: ${msg}`));
    this.name = "VkApiError";
    this.errorCode = code;
    this.errorMsg = sanitizeVkError(msg);
  }
}

export class VkApiClient implements VkCaller {
  private readonly config: VkPluginConfig;
  private readonly userToken: string;
  private readonly groupToken: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly binaryMultipartSupported: boolean;
  private lastRequestTime = 0;

  constructor(
    config: VkPluginConfig,
    tokens: { userToken: string; groupToken: string },
    options: VkApiClientOptions = {},
  ) {
    this.config = config;
    this.userToken = tokens.userToken;
    this.groupToken = tokens.groupToken;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 30_000;
    this.maxBytes = options.maxResponseBytes ?? 2_097_152; // 2MB
    this.binaryMultipartSupported = options.binaryMultipartSupported ?? true;
  }

  private async readBodyWithCap(response: Response, abortSignal?: AbortSignal): Promise<string> {
    const body = response.body;
    if (!body) return "";

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let received = 0;

    try {
      while (true) {
        if (abortSignal?.aborted) {
          throw new Error("Response body read aborted");
        }
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          received += value.byteLength;
          if (received > this.maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Response body exceeded maximum allowed ${this.maxBytes} bytes`);
          }
          result += decoder.decode(value, { stream: true });
        }
      }
      result += decoder.decode();
      return result;
    } catch (err: any) {
      await reader.cancel().catch(() => {});
      throw err;
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const rps = this.config.rateLimitRps ?? 3;
    const minIntervalMs = Math.ceil(1000 / rps);
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async call<T = any>(
    method: string,
    params: VkApiParams = {},
    tokenType: VkTokenType = "user",
  ): Promise<T> {
    const token = tokenType === "group" ? this.groupToken : this.userToken;
    if (!token) {
      throw new Error(`Token for "${tokenType}" is missing or unresolved`);
    }

    const version = this.config.apiVersion ?? "5.199";
    const bodyParams = new URLSearchParams();
    bodyParams.set("v", version);
    bodyParams.set("access_token", token);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        bodyParams.set(key, value.join(","));
      } else {
        bodyParams.set(key, String(value));
      }
    }

    const url = `https://api.vk.com/method/${encodeURIComponent(method)}`;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.enforceRateLimit();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      let rawText = "";
      try {
        response = await this.fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: bodyParams.toString(),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from VK API on method ${method}`);
        }

        rawText = await this.readBodyWithCap(response, controller.signal);
      } catch (err: any) {
        if (err.name === "AbortError" || controller.signal.aborted) {
          throw new Error(`VK API call to ${method} timed out after ${this.timeoutMs}ms`);
        }
        throw new Error(sanitizeVkError(err.message ?? String(err)));
      } finally {
        clearTimeout(timer);
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (err: any) {
        throw new Error(`Invalid JSON from VK API: ${sanitizeVkError(err.message)}`);
      }

      if (data.error) {
        const code = Number(data.error.error_code);
        const msg = String(data.error.error_msg ?? "Unknown error");

        // VK Error 6: Too many requests per second -> exponential backoff retry
        if (code === 6 && attempt < maxRetries) {
          const delay = (attempt + 1) * 350;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new VkApiError(code, msg);
      }

      return data.response as T;
    }

    throw new Error(`VK API method ${method} failed after retries`);
  }

  async fetchPublicBlob(url: string, maxBytes = 25 * 1024 * 1024): Promise<Blob> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 2);
    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Media source returned HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > maxBytes) throw new Error(`Media exceeds ${maxBytes} bytes`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Media response body is empty");

      const chunks: ArrayBuffer[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Media exceeds ${maxBytes} bytes`);
          }
          chunks.push(value.slice().buffer);
        }
      }

      return new Blob(chunks, { type: response.headers.get("content-type") ?? "application/octet-stream" });
    } catch (err: any) {
      if (err.name === "AbortError" || controller.signal.aborted) {
        throw new Error(`Media download timed out after ${this.timeoutMs * 2}ms`);
      }
      throw new Error(sanitizeVkError(err.message ?? String(err)));
    } finally {
      clearTimeout(timer);
    }
  }

  async uploadFile(uploadUrl: string, fieldName: string, fileBlob: Blob, filename = "file.jpg"): Promise<any> {
    if (!this.binaryMultipartSupported) {
      throw new Error(
        "Binary multipart upload is unavailable through the current Paperclip ctx.http.fetch RPC transport",
      );
    }

    const validation = validateUploadUrl(uploadUrl);
    if (!validation.valid) {
      throw new Error(`Upload aborted: target URL is not a trusted VK upload server (${validation.reason})`);
    }

    const formData = new FormData();
    formData.append(fieldName, fileBlob, filename);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * 2);

    try {
      const response = await this.fetchFn(uploadUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Upload server responded with HTTP ${response.status}`);
      }

      const text = await this.readBodyWithCap(response, controller.signal);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`File upload to VK timed out after ${this.timeoutMs * 2}ms`);
      }
      throw new Error(sanitizeVkError(err.message ?? String(err)));
    } finally {
      clearTimeout(timer);
    }
  }
}
