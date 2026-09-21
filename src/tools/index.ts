import type { ToolResult } from "@paperclipai/plugin-sdk";
import type { VkCaller, VkPluginConfig } from "../types.js";
import { vkCommentsCreate, vkCommentsDelete, vkCommentsGet, vkMembersBan, vkMembersUnban } from "./comments.js";
import { vkGroupGetDetails, vkGroupIsMember } from "./group.js";
import { vkMediaCreatePoll, vkMediaUploadDocument, vkMediaUploadPhoto, vkMediaUploadVideo } from "./media.js";
import { vkMessagesGetConversations, vkMessagesGetHistory, vkMessagesMarkAsRead, vkMessagesSend } from "./messages.js";
import { vkStatsGetPostReach, vkStatsGetSummary } from "./stats.js";
import { vkWallDelete, vkWallEdit, vkWallGet, vkWallPin, vkWallPost, vkWallUnpin } from "./wall.js";

export type ToolHandler = (client: VkCaller, config: VkPluginConfig, params: any) => Promise<any>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // 1-2
  vk_group_get_details: vkGroupGetDetails,
  vk_group_is_member: vkGroupIsMember,
  // 3-8
  vk_wall_post: vkWallPost,
  vk_wall_edit: vkWallEdit,
  vk_wall_delete: vkWallDelete,
  vk_wall_get: vkWallGet,
  vk_wall_pin: vkWallPin,
  vk_wall_unpin: vkWallUnpin,
  // 9-12
  vk_media_upload_photo: vkMediaUploadPhoto,
  vk_media_upload_document: vkMediaUploadDocument,
  vk_media_upload_video: vkMediaUploadVideo,
  vk_media_create_poll: vkMediaCreatePoll,
  // 13-17
  vk_comments_get: vkCommentsGet,
  vk_comments_create: vkCommentsCreate,
  vk_comments_delete: vkCommentsDelete,
  vk_members_ban: vkMembersBan,
  vk_members_unban: vkMembersUnban,
  // 18-21
  vk_messages_get_conversations: vkMessagesGetConversations,
  vk_messages_get_history: vkMessagesGetHistory,
  vk_messages_send: vkMessagesSend,
  vk_messages_mark_as_read: vkMessagesMarkAsRead,
  // 22-23
  vk_stats_get_summary: vkStatsGetSummary,
  vk_stats_get_post_reach: vkStatsGetPostReach,
};

export async function executePluginTool(
  toolName: string,
  client: VkCaller,
  config: VkPluginConfig,
  params: any,
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { error: `Unknown tool: ${toolName}` };
  }

  try {
    const data = await handler(client, config, params ?? {});
    return {
      content: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      data,
    };
  } catch (err: any) {
    return {
      error: err.message ?? String(err),
    };
  }
}
