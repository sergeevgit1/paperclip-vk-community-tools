import type { VkCaller, VkPluginConfig } from "../types.js";

export async function vkStatsGetSummary(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  const now = Math.floor(Date.now() / 1000);
  const days = Math.max(1, Math.min(30, Number(params.intervalsCount ?? 7)));
  const timestampTo = Number(params.timestampTo ?? now);
  const timestampFrom = Number(params.timestampFrom ?? timestampTo - days * 86400);
  const intervals = await client.call<any[]>("stats.get", {
    group_id: Math.abs(config.groupId), timestamp_from: timestampFrom,
    timestamp_to: timestampTo, interval: "day", intervals_count: days, extended: 1,
  }, "user");

  const totals = (Array.isArray(intervals) ? intervals : []).reduce((acc, item) => {
    const reach = item.reach ?? {};
    const activity = item.activity ?? {};
    acc.visitors += Number(item.visitors?.visitors ?? 0);
    acc.views += Number(item.visitors?.views ?? 0);
    acc.reach += Number(reach.reach ?? 0);
    acc.reachSubscribers += Number(reach.reach_subscribers ?? 0);
    acc.reachViral += Number(reach.reach_viral ?? 0);
    acc.comments += Number(activity.comments ?? 0);
    acc.likes += Number(activity.likes ?? 0);
    acc.subscribed += Number(activity.subscribed ?? 0);
    acc.unsubscribed += Number(activity.unsubscribed ?? 0);
    return acc;
  }, { visitors: 0, views: 0, reach: 0, reachSubscribers: 0, reachViral: 0, comments: 0, likes: 0, subscribed: 0, unsubscribed: 0 });

  return { timestampFrom, timestampTo, intervalsCount: days, totals, intervals };
}

export async function vkStatsGetPostReach(client: VkCaller, config: VkPluginConfig, params: any): Promise<any> {
  if (!Array.isArray(params.postIds) || params.postIds.length === 0 || params.postIds.length > 300) {
    throw new Error("postIds must contain between 1 and 300 integers");
  }
  return client.call("stats.getPostReach", {
    owner_id: -Math.abs(config.groupId), post_ids: params.postIds,
  }, "user");
}
