import type { VkCaller, VkPluginConfig } from "../types.js";

function ownerId(config: VkPluginConfig): number {
  return -Math.abs(config.groupId);
}

function attachments(value?: string[]): string | undefined {
  return value && value.length > 0 ? value.join(",") : undefined;
}

export async function vkWallPost(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  const message = typeof params.message === "string" ? params.message : "";
  const attached = attachments(params.attachments);
  if (!message && !attached) throw new Error("message or attachments must be provided");
  if (message.length > 16_384) throw new Error("message exceeds 16384 characters");

  return client.call(
    "wall.post",
    {
      owner_id: ownerId(config),
      from_group: 1,
      message,
      attachments: attached,
      publish_date: params.publishDate,
      mute_notifications: params.muteNotifications ? 1 : 0,
      close_comments: params.closeComments ? 1 : 0,
    },
    "user",
  );
}

export async function vkWallEdit(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId)) throw new Error("postId must be an integer");
  return client.call(
    "wall.edit",
    {
      owner_id: ownerId(config),
      post_id: params.postId,
      message: params.message,
      attachments: attachments(params.attachments),
      publish_date: params.publishDate,
    },
    "user",
  );
}

export async function vkWallDelete(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId)) throw new Error("postId must be an integer");
  return client.call("wall.delete", { owner_id: ownerId(config), post_id: params.postId }, "user");
}

export async function vkWallGet(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  return client.call(
    "wall.get",
    {
      owner_id: ownerId(config),
      filter: params.filter ?? "owner",
      count: params.count ?? 20,
      offset: params.offset ?? 0,
    },
    "user",
  );
}

export async function vkWallPin(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId)) throw new Error("postId must be an integer");
  return client.call("wall.pin", { owner_id: ownerId(config), post_id: params.postId }, "user");
}

export async function vkWallUnpin(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.postId)) throw new Error("postId must be an integer");
  return client.call("wall.unpin", { owner_id: ownerId(config), post_id: params.postId }, "user");
}
