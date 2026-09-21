import { describe, expect, it, vi } from "vitest";
import { TOOL_HANDLERS } from "../src/tools/index.js";
import type { VkCaller, VkPluginConfig, VkTokenType } from "../src/types.js";

const config: VkPluginConfig = {
  groupId: 229871234,
  userTokenRef: "sec-user",
  groupTokenRef: "sec-group",
  apiVersion: "5.199",
};

function createMockClient() {
  const calls: Array<{ method: string; params: any; tokenType?: VkTokenType }> = [];
  const client: VkCaller = {
    call: vi.fn(async (method: string, params: any = {}, tokenType?: VkTokenType) => {
      calls.push({ method, params, tokenType });
      if (method === "groups.getById") return [{ id: config.groupId, name: "Test Group", members_count: 42 }];
      if (method === "groups.isMember") return 1;
      if (method === "photos.getWallUploadServer" || method === "docs.getWallUploadServer") {
        return { upload_url: "https://pu.vk.com/upload" };
      }
      if (method === "photos.saveWallPhoto") return [{ id: 123, owner_id: -config.groupId }];
      if (method === "docs.save") return { doc: { id: 124, owner_id: -config.groupId } };
      if (method === "video.save") return { owner_id: -config.groupId, video_id: 77, upload_url: "https://pu.vk.com/video" };
      if (method === "polls.create") return { owner_id: -config.groupId, id: 88 };
      if (method === "stats.get") return [{ visitors: { visitors: 2, views: 4 }, reach: { reach: 5 }, activity: { likes: 1 } }];
      if (method === "stats.getPostReach") return [{ post_id: 1, reach_total: 10 }];
      return { success: 1, items: [], count: 0 };
    }) as any,
    fetchPublicBlob: vi.fn(async () => new Blob(["fake"], { type: "application/octet-stream" })),
    uploadFile: vi.fn(async (_url, fieldName) =>
      fieldName === "photo"
        ? { photo: "payload", server: 1, hash: "hash" }
        : { file: "doc-payload" }),
  };
  return { client, calls };
}

const cases: Array<{
  tool: string;
  params: any;
  method: string;
  token: VkTokenType;
}> = [
  { tool: "vk_group_get_details", params: {}, method: "groups.getById", token: "group" },
  { tool: "vk_group_is_member", params: { userId: 1 }, method: "groups.isMember", token: "group" },
  { tool: "vk_wall_post", params: { message: "Hello" }, method: "wall.post", token: "user" },
  { tool: "vk_wall_edit", params: { postId: 1, message: "Edit" }, method: "wall.edit", token: "user" },
  { tool: "vk_wall_delete", params: { postId: 1 }, method: "wall.delete", token: "user" },
  { tool: "vk_wall_get", params: {}, method: "wall.get", token: "user" },
  { tool: "vk_wall_pin", params: { postId: 1 }, method: "wall.pin", token: "user" },
  { tool: "vk_wall_unpin", params: { postId: 1 }, method: "wall.unpin", token: "user" },
  { tool: "vk_media_upload_photo", params: { url: "https://example.com/a.jpg" }, method: "photos.getWallUploadServer", token: "user" },
  { tool: "vk_media_upload_document", params: { url: "https://example.com/a.pdf", title: "a.pdf" }, method: "docs.getWallUploadServer", token: "user" },
  { tool: "vk_media_upload_video", params: { name: "Video" }, method: "video.save", token: "user" },
  { tool: "vk_media_create_poll", params: { question: "Q?", answers: ["A", "B"] }, method: "polls.create", token: "user" },
  { tool: "vk_comments_get", params: { postId: 1 }, method: "wall.getComments", token: "group" },
  { tool: "vk_comments_create", params: { postId: 1, message: "Reply" }, method: "wall.createComment", token: "group" },
  { tool: "vk_comments_delete", params: { commentId: 1 }, method: "wall.deleteComment", token: "group" },
  { tool: "vk_members_ban", params: { userId: 1 }, method: "groups.ban", token: "group" },
  { tool: "vk_members_unban", params: { userId: 1 }, method: "groups.unban", token: "group" },
  { tool: "vk_messages_get_conversations", params: {}, method: "messages.getConversations", token: "group" },
  { tool: "vk_messages_get_history", params: { peerId: 1 }, method: "messages.getHistory", token: "group" },
  { tool: "vk_messages_send", params: { peerId: 1, message: "Hi", randomId: 123 }, method: "messages.send", token: "group" },
  { tool: "vk_messages_mark_as_read", params: { peerId: 1 }, method: "messages.markAsRead", token: "group" },
  { tool: "vk_stats_get_summary", params: { intervalsCount: 7 }, method: "stats.get", token: "user" },
  { tool: "vk_stats_get_post_reach", params: { postIds: [1] }, method: "stats.getPostReach", token: "user" },
];

describe("all 23 VK tool handlers", () => {
  it("contains exactly 23 handlers", () => {
    expect(Object.keys(TOOL_HANDLERS)).toHaveLength(23);
  });

  for (const testCase of cases) {
    it(`${testCase.tool} routes to ${testCase.method} with ${testCase.token} token`, async () => {
      const { client, calls } = createMockClient();
      const handler = TOOL_HANDLERS[testCase.tool];
      expect(handler).toBeTypeOf("function");

      const result = await handler(client, config, testCase.params);

      expect(result).toBeDefined();
      expect(calls.some((c) => c.method === testCase.method && c.tokenType === testCase.token)).toBe(true);
    });
  }

  it("wall writes always target the negative community owner and from_group", async () => {
    const { client, calls } = createMockClient();
    await TOOL_HANDLERS.vk_wall_post(client, config, { message: "Hello" });
    expect(calls[0].params.owner_id).toBe(-229871234);
    expect(calls[0].params.from_group).toBe(1);
  });

  it("message send keeps provided randomId for idempotency", async () => {
    const { client, calls } = createMockClient();
    await TOOL_HANDLERS.vk_messages_send(client, config, { peerId: 77, message: "Hi", randomId: 456 });
    expect(calls[0].params.random_id).toBe(456);
  });
});
