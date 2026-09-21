import type { VkCaller, VkPluginConfig } from "../types.js";

function randomInt32(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export async function vkMessagesGetConversations(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  return client.call("messages.getConversations", {
    filter: params.filter ?? "all", count: params.count ?? 20, offset: params.offset ?? 0,
    extended: 1, group_id: Math.abs(config.groupId),
  }, "group");
}

export async function vkMessagesGetHistory(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.peerId)) throw new Error("peerId must be an integer");
  return client.call("messages.getHistory", {
    peer_id: params.peerId, count: params.count ?? 20, offset: params.offset ?? 0,
    extended: 1, group_id: Math.abs(config.groupId),
  }, "group");
}

export async function vkMessagesSend(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.peerId) || typeof params.message !== "string") {
    throw new Error("peerId and message are required");
  }
  return client.call("messages.send", {
    peer_id: params.peerId, message: params.message, random_id: params.randomId ?? randomInt32(),
    group_id: Math.abs(config.groupId),
    attachment: Array.isArray(params.attachments) ? params.attachments.join(",") : undefined,
  }, "group");
}

export async function vkMessagesMarkAsRead(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Number.isInteger(params.peerId)) throw new Error("peerId must be an integer");
  return client.call("messages.markAsRead", {
    peer_id: params.peerId, group_id: Math.abs(config.groupId),
  }, "group");
}
