import { describe, expect, it, vi } from "vitest";
import { VkLongPollClient } from "../src/events/long-poll.js";

describe("VkLongPollClient", () => {
  it("fetches server credentials and delivers updates", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              server: "https://lp.vk.com/a123",
              key: "test_key",
              ts: "100",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ts: "101",
            updates: [
              {
                type: "message_new",
                group_id: 238558829,
                event_id: "evt_1",
                object: { message: { id: 1, peer_id: 123, text: "Hi" } },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const onEvent = vi.fn();
    const onCursor = vi.fn();
    const poller = new VkLongPollClient({
      groupId: 238558829,
      apiVersion: "5.199",
      groupToken: "vk-test-group-token",
      fetchFn,
      onEvent,
      onCursor,
      waitSeconds: 1,
    });

    const result = await poller.pollOnce();

    expect(result.updates).toBe(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message_new", event_id: "evt_1" }),
    );
    expect(onCursor).toHaveBeenLastCalledWith({
      server: "https://lp.vk.com/a123",
      key: "test_key",
      ts: "101",
    });

    expect(fetchFn.mock.calls[0][0]).toContain("groups.getLongPollServer");
    expect(fetchFn.mock.calls[1][0]).toContain("act=a_check");
  });

  it("updates ts on failed=1 without refreshing credentials", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ failed: 1, ts: "202" }), { status: 200 }),
    );
    const onCursor = vi.fn();
    const poller = new VkLongPollClient({
      groupId: 238558829,
      apiVersion: "5.199",
      groupToken: "vk-test-group-token",
      fetchFn,
      onEvent: vi.fn(),
      onCursor,
      initialCursor: {
        server: "https://lp.vk.com/a123",
        key: "test_key",
        ts: "200",
      },
    });

    const result = await poller.pollOnce();

    expect(result).toEqual({ updates: 0, recovered: "ts" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onCursor).toHaveBeenLastCalledWith(
      expect.objectContaining({ ts: "202" }),
    );
  });

  it.each([2, 3])("invalidates credentials on failed=%s", async (failedCode) => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ failed: failedCode }), { status: 200 }),
    );
    const onCursor = vi.fn();
    const poller = new VkLongPollClient({
      groupId: 238558829,
      apiVersion: "5.199",
      groupToken: "vk-test-group-token",
      fetchFn,
      onEvent: vi.fn(),
      onCursor,
      initialCursor: {
        server: "https://lp.vk.com/a123",
        key: "test_key",
        ts: "200",
      },
    });

    const result = await poller.pollOnce();

    expect(result).toEqual({ updates: 0, recovered: "credentials" });
    expect(onCursor).toHaveBeenLastCalledWith(null);
  });
});
