import type { VkCaller, VkPluginConfig } from "../types.js";

export async function vkGroupGetDetails(
  client: VkCaller,
  config: VkPluginConfig,
  params: { fields?: string[] } = {},
): Promise<any> {
  const fields = params.fields ?? [
    "description",
    "members_count",
    "status",
    "site",
    "verified",
    "activity",
  ];

  const response = await client.call<any[]>(
    "groups.getById",
    {
      group_id: config.groupId,
      fields,
    },
    "group",
  );

  const group = Array.isArray(response) ? response[0] : (response as any)?.groups?.[0];
  if (!group) {
    throw new Error(`Group with ID ${config.groupId} not found`);
  }

  return group;
}

export async function vkGroupIsMember(
  client: VkCaller,
  config: VkPluginConfig,
  params: { userId: number },
): Promise<{ isMember: boolean; userId: number }> {
  if (!params.userId || typeof params.userId !== "number") {
    throw new Error("userId must be a valid integer");
  }

  const response = await client.call<number | { member: number }>(
    "groups.isMember",
    {
      group_id: config.groupId,
      user_id: params.userId,
    },
    "group",
  );

  const isMember = typeof response === "number" ? response === 1 : Boolean((response as any)?.member);
  return {
    isMember,
    userId: params.userId,
  };
}
