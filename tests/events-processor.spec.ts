import { describe, expect, it, vi } from "vitest";
import { VkEventProcessor } from "../src/events/processor.js";

describe("VkEventProcessor", () => {
  it("persists before routing and does not process duplicate delivery twice", async () => {
    const calls: string[] = [];
    const journal = {
      receive: vi
        .fn()
        .mockImplementationOnce(async () => {
          calls.push("persist");
          return { inserted: true, rowId: "row-1" };
        })
        .mockResolvedValueOnce({ inserted: false }),
      complete: vi.fn().mockImplementation(async () => {
        calls.push("complete");
      }),
      fail: vi.fn(),
    };
    const router = {
      routeEvent: vi.fn().mockImplementation(async () => {
        calls.push("route");
        return {
          actionTaken: "invoked_agent",
          assignedAgentId: "agent-1",
          agentRunId: "run-1",
        };
      }),
    };
    const processor = new VkEventProcessor({
      companyId: "00000000-0000-0000-0000-000000000001",
      groupId: 238558829,
      journal: journal as any,
      router: router as any,
    });
    const raw = {
      type: "message_new",
      group_id: 238558829,
      event_id: "evt-1",
      object: { message: { id: 1, peer_id: 123, from_id: 123, text: "Hi" } },
    };

    const first = await processor.process(raw, "long_poll");
    const second = await processor.process(raw, "long_poll");

    expect(first.status).toBe("processed");
    expect(second.status).toBe("duplicate");
    expect(calls).toEqual(["persist", "route", "complete"]);
    expect(router.routeEvent).toHaveBeenCalledTimes(1);
  });

  it("stores echo messages but never invokes an agent", async () => {
    const journal = {
      receive: vi.fn().mockResolvedValue({ inserted: true, rowId: "row-1" }),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const router = { routeEvent: vi.fn() };
    const processor = new VkEventProcessor({
      companyId: "00000000-0000-0000-0000-000000000001",
      groupId: 238558829,
      journal: journal as any,
      router: router as any,
    });

    const result = await processor.process(
      {
        type: "message_reply",
        group_id: 238558829,
        event_id: "evt-echo",
        object: { id: 2, from_id: -238558829, peer_id: 123, text: "Our reply" },
      },
      "callback",
    );

    expect(result.status).toBe("ignored_echo");
    expect(router.routeEvent).not.toHaveBeenCalled();
    expect(journal.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ actionTaken: "ignored_echo" }),
    );
  });
});
