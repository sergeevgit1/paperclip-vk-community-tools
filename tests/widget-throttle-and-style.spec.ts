import { readFileSync } from "node:fs";
import path from "node:path";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("VK Widget Style and 12-hour Caching", () => {
  it("does not wrap VkDashboardWidget root in nested card background or border", () => {
    const widgetSrcPath = path.resolve(import.meta.dirname, "../src/ui/widget.tsx");
    const src = readFileSync(widgetSrcPath, "utf8");

    // Root container of widget should not have double-nested card classes:
    // 'bg-[#1b1b1b] border border-white/10 shadow-black/30' or 'p-5'
    expect(src).not.toMatch(/className="[^"]*bg-\[#1b1b1b\][^"]*border border-white\/10/);
    expect(src).not.toMatch(/className="[^"]*p-5 rounded-2xl bg-\[#1b1b1b\]/);
  });

  it("caches vk-community-summary for 12 hours unless force=true is passed", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        groupId: 229871234,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
        apiVersion: "5.199",
      },
    });

    harness.ctx.secrets.resolve = async (ref: any) => "vk1.a.mock-token";

    let fetchCount = 0;
    harness.ctx.http.fetch = vi.fn(async (url: string) => {
      fetchCount++;
      if (url.includes("groups.getById")) {
        return new Response(
          JSON.stringify({
            response: [
              {
                id: 229871234,
                name: "Cached Club",
                screen_name: "cached_club",
                members_count: 500,
                verified: 0,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ response: { items: [], count: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await plugin.definition.setup(harness.ctx);

    const companyId = "7c4aab26-accd-4741-a149-24df46b4f3e7";

    // 1st call: hits network
    const first = await harness.getData("vk-community-summary", { companyId });
    expect(first).toBeDefined();
    expect((first as any).ok).toBe(true);
    expect((first as any).name).toBe("Cached Club");
    expect((first as any).cached).toBe(false);
    const initialFetches = fetchCount;
    expect(initialFetches).toBeGreaterThan(0);

    // 2nd call immediately: must return cached data without extra network requests
    const second = await harness.getData("vk-community-summary", { companyId });
    expect(second).toBeDefined();
    expect((second as any).ok).toBe(true);
    expect((second as any).cached).toBe(true);
    expect(fetchCount).toBe(initialFetches);

    // 3rd call with force=true: bypasses cache and fetches fresh data
    const forced = await harness.getData("vk-community-summary", { companyId, force: true });
    expect(forced).toBeDefined();
    expect((forced as any).ok).toBe(true);
    expect((forced as any).cached).toBe(false);
    expect(fetchCount).toBeGreaterThan(initialFetches);
  });
});
