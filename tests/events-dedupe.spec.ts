import { describe, expect, it } from "vitest";
import { EventDeduplicator } from "../src/events/dedupe.js";

describe("EventDeduplicator and Anti-Loop Guard", () => {
  it("detects duplicate event IDs within TTL window", () => {
    const dedupe = new EventDeduplicator({ ttlMs: 5000, maxEntries: 100 });
    expect(dedupe.isDuplicate("msg_1")).toBe(false);
    expect(dedupe.isDuplicate("msg_1")).toBe(true);
    expect(dedupe.isDuplicate("msg_2")).toBe(false);
  });

  it("identifies community echo messages to prevent self-triggering", () => {
    const dedupe = new EventDeduplicator();
    expect(
      dedupe.isCommunityEcho({
        actorUserId: -238558829,
        groupId: 238558829,
        type: "message_new",
      }),
    ).toBe(true);

    expect(
      dedupe.isCommunityEcho({
        actorUserId: 12345,
        groupId: 238558829,
        type: "message_reply",
      }),
    ).toBe(true);

    expect(
      dedupe.isCommunityEcho({
        actorUserId: 12345,
        groupId: 238558829,
        type: "message_new",
      }),
    ).toBe(false);
  });

  it("limits maximum replies to the same peer in sliding time window", () => {
    const dedupe = new EventDeduplicator({ rateLimitWindowMs: 60_000 });
    const peerId = 999;
    const maxAllowed = 3;

    for (let i = 0; i < maxAllowed; i++) {
      expect(dedupe.checkRateLimit(peerId, maxAllowed)).toBe(true);
      dedupe.recordAction(peerId);
    }

    // Next attempt must be rejected by anti-loop
    expect(dedupe.checkRateLimit(peerId, maxAllowed)).toBe(false);

    // Different peer must not be blocked
    expect(dedupe.checkRateLimit(888, maxAllowed)).toBe(true);
  });
});
