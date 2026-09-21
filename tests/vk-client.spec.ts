import { describe, expect, it, vi } from "vitest";
import { VkApiClient, VkApiError } from "../src/vk-client.js";

describe("VK API Client", () => {
  const baseConfig = {
    groupId: 123456,
    userTokenRef: "sec-user",
    groupTokenRef: "sec-group",
    apiVersion: "5.199",
    rateLimitRps: 100, // fast for tests
  };

  const tokens = {
    userToken: "vk1.a.mockUserToken1234567890",
    groupToken: "vk1.a.mockGroupToken1234567890",
  };

  it("selects userToken when tokenType is user and passes version 5.199", async () => {
    let capturedBody = "";
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ response: { success: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new VkApiClient(baseConfig, tokens, { fetchFn: mockFetch as any });
    const res = await client.call("wall.post", { message: "Hello VK" }, "user");

    expect(res).toEqual({ success: 1 });
    expect(capturedBody).toContain("access_token=" + encodeURIComponent(tokens.userToken));
    expect(capturedBody).toContain("v=5.199");
    expect(capturedBody).toContain("message=Hello+VK");
  });

  it("selects groupToken when tokenType is group", async () => {
    let capturedBody = "";
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ response: { count: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new VkApiClient(baseConfig, tokens, { fetchFn: mockFetch as any });
    const res = await client.call("messages.getConversations", {}, "group");

    expect(res).toEqual({ count: 1 });
    expect(capturedBody).toContain("access_token=" + encodeURIComponent(tokens.groupToken));
  });

  it("retries on VK error 6 (Too many requests per second) with backoff", async () => {
    let calls = 0;
    const mockFetch = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            error: { error_code: 6, error_msg: "Too many requests per second" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ response: "recovered" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new VkApiClient(baseConfig, tokens, { fetchFn: mockFetch as any });
    const res = await client.call("groups.getById", {}, "group");

    expect(calls).toBe(2);
    expect(res).toBe("recovered");
  });

  it("sanitizes tokens from error messages", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            error_code: 5,
            error_msg: `User authorization failed: invalid access_token=${tokens.userToken}`,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new VkApiClient(baseConfig, tokens, { fetchFn: mockFetch as any });

    await expect(client.call("wall.post", {}, "user")).rejects.toThrow(VkApiError);
    await expect(client.call("wall.post", {}, "user")).rejects.toThrow(/\[REDACTED\]/);
    await expect(client.call("wall.post", {}, "user")).rejects.not.toThrow(tokens.userToken);
  });

  it("enforces maxResponseBytes on body reading", async () => {
    const huge = "x".repeat(200);
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ response: huge }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new VkApiClient(baseConfig, tokens, {
      fetchFn: mockFetch as any,
      maxResponseBytes: 50,
    });

    await expect(client.call("wall.get", {}, "user")).rejects.toThrow(
      /exceeded maximum allowed 50 bytes/,
    );
  });

  it("times out when response headers arrive but the body stream stalls", async () => {
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"response":'));
          signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const client = new VkApiClient(baseConfig, tokens, {
      fetchFn: mockFetch as any,
      requestTimeoutMs: 20,
    });

    await expect(client.call("wall.get", {}, "user")).rejects.toThrow(/timed out after 20ms/);
  });

  it("rejects binary multipart when the host transport cannot preserve FormData", async () => {
    const mockFetch = vi.fn();
    const client = new VkApiClient(baseConfig, tokens, {
      fetchFn: mockFetch as any,
      binaryMultipartSupported: false,
    });

    await expect(
      client.uploadFile("https://pu.vk.com/upload", "photo", new Blob(["test"])),
    ).rejects.toThrow(/Binary multipart upload is unavailable/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
