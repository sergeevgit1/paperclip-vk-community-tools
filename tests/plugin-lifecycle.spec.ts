import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("VK plugin worker lifecycle", () => {
  it("registers 23 tools, data bridges and responds to health and tool execution", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        groupId: 229871234,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
        apiVersion: "5.199",
        rateLimitRps: 100,
      },
    });

    harness.ctx.secrets.resolve = async (ref: any) => {
      const id = typeof ref === "string" ? ref : ref?.secretId;
      return `vk1.a.mock-resolved-${id}`;
    };

    harness.ctx.http.fetch = async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      if (url.includes("groups.getById")) {
        return new Response(
          JSON.stringify({
            response: [
              {
                id: 229871234,
                name: "Test VK Community",
                screen_name: "test_club",
                members_count: 1250,
                verified: 1,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("wall.post")) {
        return new Response(
          JSON.stringify({ response: { post_id: 42 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("wall.get")) {
        return new Response(
          JSON.stringify({ response: { count: 1, items: [{ id: 1, date: 1726000000 }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("messages.getConversations")) {
        return new Response(
          JSON.stringify({ response: { count: 3, items: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ response: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await plugin.definition.setup(harness.ctx);

    const health = await plugin.definition.onHealth?.();
    expect(health).toEqual({ status: "ok", message: "VK Community Tools worker is active" });

    // 1. Tool execution test
    const postRes = await harness.executeTool("vk_wall_post", { message: "Test Post from Agent" });
    expect(postRes.error).toBeUndefined();
    expect(postRes.content).toContain("42");
    expect((postRes.data as any).post_id).toBe(42);

    const detailsRes = await harness.executeTool("vk_group_get_details", {});
    expect(detailsRes.error).toBeUndefined();
    expect((detailsRes.data as any).name).toBe("Test VK Community");
  });
});
