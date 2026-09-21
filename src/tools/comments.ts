import type { VkCaller, VkPluginConfig } from "../types.js";

function ownerId(config: VkPluginConfig): number {
  return -Math.abs(config.groupId);
}

export async function vkCommentsGet(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId)) throw new Error("postId must be an integer");
  return client.call("wall.getComments", {
    owner_id: ownerId(config), post_id: params.postId, count: params.count ?? 20,
    offset: params.offset ?? 0, sort: params.sort ?? "asc", thread_items_count: 10,
  }, "group");
}

export async function vkCommentsCreate(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId) || typeof params.message !== "string") {
    throw new Error("postId and message are required");
  }
  return client.call("wall.createComment", {
    owner_id: ownerId(config), post_id: params.postId, from_group: Math.abs(config.groupId),
    message: params.message, reply_to_comment: params.replyToCommentId,
    attachments: Array.isArray(params.attachments) ? params.attachments.join(",") : undefined,
  }, "group");
}

export async function vkCommentsDelete(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.commentId)) throw new Error("commentId must be an integer");
  return client.call("wall.deleteComment", { owner_id: ownerId(config), comment_id: params.commentId }, "group");
}

export async function vkMembersBan(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.userId)) throw new Error("userId must be an integer");
  return client.call("groups.ban", {
    group_id: Math.abs(config.groupId), owner_id: params.userId, end_date: params.endDate ?? 0,
    reason: params.reason ?? 0, comment: params.comment, comment_visible: params.comment ? 1 : 0,
  }, "group");
}

export async function vkMembersUnban(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.userId)) throw new Error("userId must be an integer");
  return client.call("groups.unban", { group_id: Math.abs(config.groupId), owner_id: params.userId }, "group");
}
