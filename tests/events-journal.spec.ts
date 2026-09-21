import { describe, expect, it, vi } from "vitest";
import { VkEventJournal } from "../src/events/journal.js";
import type { NormalizedVkEvent } from "../src/events/types.js";

function event(): NormalizedVkEvent {
  return {
    id: "evt-1",
    groupId: 238558829,
    type: "message_new",
    category: "support",
    occurredAt: new Date("2026-09-21T06:00:00Z"),
    receivedAt: new Date("2026-09-21T06:00:01Z"),
    peerId: 100,
    actorUserId: 100,
    text: "Помогите",
    transport: "long_poll",
    rawPayload: { type: "message_new" },
  };
}

describe("VkEventJournal", () => {
  it("returns inserted=false when the durable unique key already exists", async () => {
    const db = {
      namespace: "plugin_test",
      query: vi.fn().mockResolvedValueOnce([]),
      execute: vi.fn(),
    };
    const journal = new VkEventJournal(db as any);

    expect(await journal.receive("00000000-0000-0000-0000-000000000001", event())).toEqual({
      inserted: false,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("ON CONFLICT (company_id, group_id, event_id) DO NOTHING");
  });

  it("returns inserted=true after a successful insert", async () => {
    const db = {
      namespace: "plugin_test",
      query: vi.fn().mockResolvedValueOnce([{ id: "row-1" }]),
      execute: vi.fn(),
    };
    const journal = new VkEventJournal(db as any);

    expect(await journal.receive("00000000-0000-0000-0000-000000000001", event())).toEqual({
      inserted: true,
      rowId: "row-1",
    });
  });

  it("records the routing outcome", async () => {
    const db = {
      namespace: "plugin_test",
      query: vi.fn(),
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };
    const journal = new VkEventJournal(db as any);

    await journal.complete("00000000-0000-0000-0000-000000000001", event(), {
      actionTaken: "invoked_agent",
      assignedAgentId: "00000000-0000-0000-0000-000000000002",
      agentRunId: "run-1",
    });

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[0][0]).toContain("status = $4");
    expect(db.execute.mock.calls[0][1]).toContain("invoked");
  });

  it("lists recent events scoped to the requested company", async () => {
    const db = {
      namespace: "plugin_test",
      query: vi.fn().mockResolvedValue([{ event_id: "evt-1", status: "audit_only" }]),
      execute: vi.fn(),
    };
    const journal = new VkEventJournal(db as any);

    const rows = await journal.listRecent("00000000-0000-0000-0000-000000000001", 20);

    expect(rows).toHaveLength(1);
    expect(db.query.mock.calls[0][0]).toContain("WHERE company_id = $1");
    expect(db.query.mock.calls[0][1]).toEqual([
      "00000000-0000-0000-0000-000000000001",
      20,
    ]);
  });

  it("redacts secret and access_token fields before persisting payload", async () => {
    const db = {
      namespace: "plugin_test",
      query: vi.fn().mockResolvedValueOnce([{ id: "row-1" }]),
      execute: vi.fn(),
    };
    const journal = new VkEventJournal(db as any);

    const sensitiveEvent = event();
    sensitiveEvent.rawPayload = {
      type: "message_new",
      secret: "super-secret-callback-key",
      access_token: "vk1.a.secret-token",
      object: { message: { text: "Hello" } },
    };

    await journal.receive("00000000-0000-0000-0000-000000000001", sensitiveEvent);

    const savedPayloadJson = db.query.mock.calls[0][1][7];
    const parsed = JSON.parse(savedPayloadJson);
    expect(parsed.secret).toBeUndefined();
    expect(parsed.access_token).toBeUndefined();
    expect(parsed.object.message.text).toBe("Hello");
  });
});
