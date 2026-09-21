import {
  definePlugin,
  runWorker,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import manifest, { validateVkPluginConfig } from "./manifest.js";
import { TOOL_HANDLERS } from "./tools/index.js";
import type { VkPluginConfig } from "./types.js";
import { VkApiClient } from "./vk-client.js";

interface ResolvedClientContext {
  client: VkApiClient;
  config: VkPluginConfig;
}

export async function resolveClient(
  ctx: PluginContext,
  companyId?: string,
): Promise<ResolvedClientContext> {
  const rawConfig = await ctx.config.get(companyId);
  const validated = validateVkPluginConfig(rawConfig);

  if (!validated.valid || !validated.config) {
    throw new Error(
      `Invalid plugin configuration: ${validated.errors?.join(", ") ?? "unknown"}`,
    );
  }

  const config = validated.config;

  let userToken: string | null = null;
  let groupToken: string | null = null;

  try {
    userToken = await ctx.secrets.resolve(config.userTokenRef as any);
  } catch (err: any) {
    throw new Error(`Failed to resolve userTokenRef: ${err.message}`);
  }

  try {
    groupToken = await ctx.secrets.resolve(config.groupTokenRef as any);
  } catch (err: any) {
    throw new Error(`Failed to resolve groupTokenRef: ${err.message}`);
  }

  if (!userToken) {
    throw new Error("Resolved userToken is empty");
  }
  if (!groupToken) {
    throw new Error("Resolved groupToken is empty");
  }

  const fetchFn = ctx.http?.fetch
    ? (url: string | URL | Request, init?: RequestInit) => ctx.http.fetch(url.toString(), init)
    : globalThis.fetch;

  const client = new VkApiClient(
    config,
    { userToken, groupToken },
    {
      fetchFn: fetchFn as any,
      requestTimeoutMs: 30_000,
      binaryMultipartSupported: false,
    },
  );

  return { client, config };
}

export const plugin = definePlugin({
  async setup(ctx: PluginContext): Promise<void> {
    // 1. Register all 23 tools declared in manifest
    const manifestTools = manifest.tools ?? [];
    for (const tool of manifestTools) {
      const handler = TOOL_HANDLERS[tool.name];
      if (!handler) {
        ctx.logger.warn(`No handler defined for tool ${tool.name}`);
        continue;
      }

      ctx.tools.register(
        tool.name,
        {
          displayName: tool.displayName,
          description: tool.description,
          parametersSchema: tool.parametersSchema,
        },
        async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
          try {
            const { client, config } = await resolveClient(ctx, runCtx.companyId);
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
        },
      );
    }

    // 2. Data bridge: vk-connection-status (for settings page diagnostics)
    ctx.data.register("vk-connection-status", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      try {
        const { client, config } = await resolveClient(ctx, companyId);
        // Test basic connectivity via group getById
        const groupInfo = await client.call<any[]>(
          "groups.getById",
          {
            group_id: config.groupId,
            fields: ["members_count", "verified", "status", "site"],
          },
          "group",
        );

        const group = Array.isArray(groupInfo) ? groupInfo[0] : (groupInfo as any)?.groups?.[0];
        return {
          connected: true,
          groupId: config.groupId,
          groupName: group?.name ?? `Club #${config.groupId}`,
          screenName: group?.screen_name ?? "",
          photo: group?.photo_200 ?? group?.photo_100 ?? "",
          membersCount: group?.members_count ?? 0,
          verified: Boolean(group?.verified),
          status: group?.status ?? "",
          apiVersion: config.apiVersion ?? "5.199",
          checkedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        return {
          connected: false,
          error: err.message ?? String(err),
          checkedAt: new Date().toISOString(),
        };
      }
    });

    // 3. Data bridge: vk-community-summary (for dashboard widget)
    ctx.data.register("vk-community-summary", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      try {
        const { client, config } = await resolveClient(ctx, companyId);

        // Group basics
        const groupsRes = await client.call<any[]>(
          "groups.getById",
          { group_id: config.groupId, fields: ["members_count", "verified", "activity"] },
          "group",
        );
        const group = Array.isArray(groupsRes) ? groupsRes[0] : (groupsRes as any)?.groups?.[0];

        // Recent posts (wall activity)
        let latestPostTime: number | null = null;
        try {
          const wallRes = await client.call<any>(
            "wall.get",
            { owner_id: -Math.abs(config.groupId), count: 2 },
            "user",
          );
          const items = wallRes?.items ?? [];
          if (items.length > 0) {
            latestPostTime = items[0].date;
          }
        } catch {
          // Soft fail for wall
        }

        // Unread/unanswered conversations
        let unansweredCount = 0;
        try {
          const convsRes = await client.call<any>(
            "messages.getConversations",
            { filter: "unanswered", count: 1, group_id: Math.abs(config.groupId) },
            "group",
          );
          unansweredCount = convsRes?.count ?? 0;
        } catch {
          // Soft fail for messages
        }

        return {
          ok: true,
          groupId: config.groupId,
          name: group?.name ?? `Club #${config.groupId}`,
          screenName: group?.screen_name ?? "",
          photo: group?.photo_100 ?? group?.photo_50 ?? "",
          membersCount: group?.members_count ?? 0,
          unansweredMessages: unansweredCount,
          latestPostTime,
          refreshedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        return {
          ok: false,
          error: err.message ?? String(err),
          refreshedAt: new Date().toISOString(),
        };
      }
    });

    // 4. Action: test-connection (interactive refresh in settings)
    ctx.actions.register("test-connection", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      const { client, config } = await resolveClient(ctx, companyId);
      const test = await client.call<any[]>(
        "groups.getById",
        { group_id: config.groupId },
        "group",
      );
      return {
        success: true,
        group: Array.isArray(test) ? test[0] : test,
        testedAt: new Date().toISOString(),
      };
    });
  },

  async onHealth(): Promise<{ status: "ok" | "error"; message?: string }> {
    return { status: "ok", message: "VK Community Tools worker is active" };
  },

  async onValidateConfig(rawConfig: Record<string, unknown>) {
    const res = validateVkPluginConfig(rawConfig);
    return {
      ok: res.valid,
      errors: res.errors,
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
