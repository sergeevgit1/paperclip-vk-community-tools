import { describe, expect, it } from "vitest";
import {
  normalizeVkEvent,
  validateCallbackRequest,
} from "../src/events/validator.js";

describe("VK event validation and normalization", () => {
  it("returns the exact confirmation code for a matching group", () => {
    expect(
      validateCallbackRequest(
        { type: "confirmation", group_id: 238558829 },
        {
          expectedGroupId: 238558829,
          confirmationCode: "test_conf_123",
          secret: "sec_abc",
        },
      ),
    ).toEqual({
      valid: true,
      isConfirmation: true,
      responseBody: "test_conf_123",
    });
  });

  it("rejects an event with a wrong callback secret", () => {
    const result = validateCallbackRequest(
      {
        type: "message_new",
        group_id: 238558829,
        secret: "wrong_secret",
        object: { message: { id: 1, peer_id: 100, text: "Hello" } },
      },
      {
        expectedGroupId: 238558829,
        confirmationCode: "test_conf_123",
        secret: "sec_abc",
      },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Secret mismatch");
  });

  it("normalizes direct messages", () => {
    const event = normalizeVkEvent(
      {
        type: "message_new",
        group_id: 238558829,
        event_id: "evt_message_1",
        object: {
          message: {
            id: 10,
            date: 1_726_000_000,
            peer_id: 555,
            from_id: 555,
            text: "Нужна помощь",
          },
        },
      },
      "callback",
    );

    expect(event).toMatchObject({
      id: "evt_message_1",
      groupId: 238558829,
      category: "support",
      type: "message_new",
      peerId: 555,
      actorUserId: 555,
      text: "Нужна помощь",
      transport: "callback",
    });
  });

  it.each([
    ["wall_reply_new", "moderation"],
    ["market_comment_new", "moderation"],
    ["donut_subscription_create", "payments"],
    ["market_order_new", "payments"],
    ["group_join", "audit"],
    ["unknown_vk_event", "unknown"],
  ] as const)("maps %s to %s", (type, category) => {
    const event = normalizeVkEvent(
      {
        type,
        group_id: 238558829,
        event_id: `evt_${type}`,
        object: { id: 1, from_id: 42, date: 1_726_000_000, text: "text" },
      },
      "long_poll",
    );

    expect(event.category).toBe(category);
    expect(event.transport).toBe("long_poll");
  });

  it("creates a deterministic id when VK omits event_id", () => {
    const raw = {
      type: "wall_reply_new",
      group_id: 238558829,
      object: { id: 77, post_id: 3, from_id: 42, date: 1_726_000_000 },
    };

    expect(normalizeVkEvent(raw, "long_poll").id).toBe(
      normalizeVkEvent(raw, "long_poll").id,
    );
  });
});
