import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("VK Plugin Events Lifecycle", () => {
  it("processes inbound webhook event and writes to journal", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        groupId: 238558829,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
        apiVersion: "5.199",
        eventTransport: "callback",
        assignedAgents: {
          supportAgentId: "agent-sup-1",
        },
      },
    });

    const companyId = "00000000-0000-0000-0000-000000000001";

    harness.seed({
      companies: [
        {
          id: companyId,
          name: "Test Company",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
      ],
      agents: [
        {
          id: "agent-sup-1",
          companyId,
          name: "Support Bot",
          status: "active",
          adapterType: "hermes_local",
        } as any,
      ],
    });

    harness.ctx.secrets.resolve = async (ref: any) => "vk1.a.mock-token";

    // Setup plugin
    await plugin.definition.setup(harness.ctx);

    // Call onWebhook with message_new
    await plugin.definition.onWebhook?.({
      endpointKey: "vk-callback",
      headers: {},
      rawBody: JSON.stringify({
        type: "message_new",
        group_id: 238558829,
        event_id: "evt-wb-1",
        object: {
          message: {
            id: 1,
            date: 1726000000,
            peer_id: 12345,
            from_id: 12345,
            text: "Тестовый вопрос в поддержку",
          },
        },
      }),
      requestId: "req-1",
    });

    // Check that database received the event insert
    const insertQuery = harness.dbQueries.find((q) =>
      q.sql.includes("INSERT INTO") && q.sql.includes("vk_event_journal"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.params).toContain(238558829);
    expect(insertQuery?.params).toContain("evt-wb-1");
  });

  it("exposes vk-recent-events data bridge", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        groupId: 238558829,
        userTokenRef: "sec-user-token",
        groupTokenRef: "sec-group-token",
      },
    });

    harness.ctx.secrets.resolve = async () => "vk1.a.token";

    await plugin.definition.setup(harness.ctx);

    // Data bridge vk-recent-events should be callable
    const recent = await harness.getData("vk-recent-events", {
      companyId: "00000000-0000-0000-0000-000000000001",
    });

    expect(recent).toBeDefined();
    expect(Array.isArray(recent)).toBe(true);
  });
});
