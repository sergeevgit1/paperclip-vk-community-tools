import { describe, expect, it, vi } from "vitest";
import { EventRouter } from "../src/events/router.js";
import type { NormalizedVkEvent } from "../src/events/types.js";

function createEvent(partial: Partial<NormalizedVkEvent>): NormalizedVkEvent {
  return {
    id: "evt_test",
    groupId: 238558829,
    type: "message_new",
    category: "support",
    occurredAt: new Date("2026-09-21T06:00:00Z"),
    receivedAt: new Date("2026-09-21T06:00:01Z"),
    peerId: 100,
    actorUserId: 100,
    text: "Вопрос по заказу",
    transport: "long_poll",
    rawPayload: {},
    ...partial,
  };
}

describe("EventRouter and Zero-Agent Invariant", () => {
  it("keeps event as journal-only if no agent is assigned to category", async () => {
    const invokeAgent = vi.fn();
    const router = new EventRouter({
      companyId: "company-1",
      assignedAgents: {
        supportAgentId: null, // Zero-agent invariant!
        moderationAgentId: "agent-mod-1",
      },
      invokeAgent,
    });

    const result = await router.routeEvent(createEvent({ category: "support" }));

    expect(result.actionTaken).toBe("audit_only");
    expect(result.assignedAgentId).toBeNull();
    expect(invokeAgent).not.toHaveBeenCalled();
  });

  it("invokes assigned support agent with structured prompt and returns runId", async () => {
    const invokeAgent = vi.fn().mockResolvedValue({ runId: "run-support-123" });
    const router = new EventRouter({
      companyId: "company-1",
      assignedAgents: {
        supportAgentId: "agent-support-1",
      },
      invokeAgent,
    });

    const event = createEvent({
      category: "support",
      type: "message_new",
      peerId: 555,
      text: "Как получить доступ?",
    });

    const result = await router.routeEvent(event);

    expect(result.actionTaken).toBe("invoked_agent");
    expect(result.assignedAgentId).toBe("agent-support-1");
    expect(result.agentRunId).toBe("run-support-123");
    expect(invokeAgent).toHaveBeenCalledWith(
      "agent-support-1",
      "company-1",
      expect.objectContaining({
        reason: "vk:message_new:555",
        prompt: expect.stringContaining("<untrusted_user_message>"),
      }),
    );
  });

  it("routes payment and moderation events to respective agents", async () => {
    const invokeAgent = vi.fn().mockResolvedValue({ runId: "run-ok" });
    const router = new EventRouter({
      companyId: "company-1",
      assignedAgents: {
        financeAgentId: "agent-finance-1",
        moderationAgentId: "agent-mod-1",
      },
      invokeAgent,
    });

    const paymentRes = await router.routeEvent(
      createEvent({ category: "payments", type: "donut_subscription_create" }),
    );
    expect(paymentRes.assignedAgentId).toBe("agent-finance-1");

    const modRes = await router.routeEvent(
      createEvent({ category: "moderation", type: "wall_reply_new" }),
    );
    expect(modRes.assignedAgentId).toBe("agent-mod-1");
  });

  it("halts all agent invocations when emergencyKillSwitch is true", async () => {
    const invokeAgent = vi.fn();
    const router = new EventRouter({
      companyId: "company-1",
      assignedAgents: {
        supportAgentId: "agent-support-1",
      },
      automationSettings: {
        emergencyKillSwitch: true,
      },
      invokeAgent,
    });

    const result = await router.routeEvent(createEvent({ category: "support" }));

    expect(result.actionTaken).toBe("kill_switch_halt");
    expect(invokeAgent).not.toHaveBeenCalled();
  });
});
