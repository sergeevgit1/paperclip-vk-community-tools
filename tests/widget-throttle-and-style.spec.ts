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

  it("returns manager metrics for messages, scheduled posts, recent posts, and VK Donut", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        groupId: 229871234,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
        apiVersion: "5.199",
      },
    });

    harness.ctx.secrets.resolve = async () => "vk1.a.mock-token";
    const now = Math.floor(Date.now() / 1000);
    const scheduledDates = [now + 7_200, now + 172_800];

    harness.ctx.http.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = decodeURIComponent(url.split("/").pop() ?? "");
      const params = new URLSearchParams(String(init?.body ?? ""));
      let response: unknown;

      if (method === "groups.getById") {
        response = [{ id: 229871234, name: "OpenCanva", screen_name: "opencanva", members_count: 1_250 }];
      } else if (method === "messages.getConversations") {
        response = {
          count: 3,
          items: [
            { conversation: { peer: { id: 101 } }, last_message: { date: now - 600, out: 0 } },
            { conversation: { peer: { id: 102 } }, last_message: { date: now - 3_600, out: 1 } },
            { conversation: { peer: { id: 103 } }, last_message: { date: now - 86_400, out: 0 } },
          ],
        };
      } else if (method === "groups.getMembers") {
        expect(params.get("filter")).toBe("donut");
        response = { count: 17, items: [] };
      } else if (method === "wall.get" && params.get("filter") === "postponed") {
        response = {
          count: 2,
          items: scheduledDates.map((date, index) => ({ id: index + 1, date, text: `Отложенный ${index + 1}` })),
        };
      } else if (method === "wall.get") {
        response = {
          count: 2,
          items: [
            { id: 11, date: now - 1_800, text: "Свежий пост", likes: { count: 20 }, comments: { count: 3 }, reposts: { count: 2 }, views: { count: 500 } },
            { id: 10, date: now - 90_000, text: "Предыдущий пост", likes: { count: 15 }, comments: { count: 1 }, reposts: { count: 0 }, views: { count: 400 } },
          ],
        };
      } else {
        throw new Error(`Unexpected VK method: ${method}`);
      }

      return new Response(JSON.stringify({ response }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await plugin.definition.setup(harness.ctx);
    const result = await harness.getData("vk-community-summary", {
      companyId: "7c4aab26-accd-4741-a149-24df46b4f3e7",
    }) as any;

    expect(result).toMatchObject({
      ok: true,
      membersCount: 1_250,
      requestsLast12Hours: 2,
      customerLastMessageCount: 2,
      activeDonutMembers: 17,
      postponedPostsCount: 2,
      nextPostTime: scheduledDates[0],
      lastScheduledPostTime: scheduledDates[1],
    });
    expect(result.recentPosts).toHaveLength(2);
    expect(result.recentPosts[0]).toMatchObject({
      id: 11,
      text: "Свежий пост",
      likes: 20,
      comments: 3,
      reposts: 2,
      views: 500,
    });
  });

  it("renders only decision-useful manager metrics", () => {
    const widgetSrcPath = path.resolve(import.meta.dirname, "../src/ui/widget.tsx");
    const src = readFileSync(widgetSrcPath, "utf8");

    expect(src).toContain("Обращения за 12 часов");
    expect(src).toContain("Последнее сообщение клиента");
    expect(src).toContain("Отложенные публикации");
    expect(src).toContain("Активные подписчики VK Donut");
    expect(src).toContain("Последние публикации");
    expect(src).not.toContain("без ответа");
    expect(src).not.toContain("Последние события");
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
