import {
  definePlugin,
  runWorker,
  type PluginConfigChangeContext,
  type PluginContext,
  type PluginWebhookInput,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { VkEventJournal } from "./events/journal.js";
import { VkLongPollClient, type VkLongPollCursor } from "./events/long-poll.js";
import { VkEventProcessor } from "./events/processor.js";
import { EventRouter } from "./events/router.js";
import type { RawVkEvent } from "./events/types.js";
import { validateCallbackRequest } from "./events/validator.js";
import manifest, { validateVkPluginConfig } from "./manifest.js";
import { TOOL_HANDLERS } from "./tools/index.js";
import type { VkPluginConfig } from "./types.js";
import { VkApiClient } from "./vk-client.js";

interface ResolvedClientContext {
  client: VkApiClient;
  config: VkPluginConfig;
}

const activePollers = new Map<string, VkLongPollClient>();
let pluginContext: PluginContext | null = null;

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

  let config = validated.config;

  // Layer company-scoped state overrides for events if present
  if (companyId) {
    try {
      const stateSettings = (await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId,
        namespace: "vk-events",
        stateKey: "settings",
      })) as Partial<VkPluginConfig> | null;

      if (stateSettings && typeof stateSettings === "object") {
        config = {
          ...config,
          eventTransport: stateSettings.eventTransport ?? config.eventTransport,
          callbackConfirmationCode:
            stateSettings.callbackConfirmationCode ?? config.callbackConfirmationCode,
          assignedAgents: {
            ...config.assignedAgents,
            ...stateSettings.assignedAgents,
          },
          automationSettings: {
            ...config.automationSettings,
            ...stateSettings.automationSettings,
          },
        };
      }
    } catch {
      // Fallback to base config
    }
  }

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

function createProcessor(
  ctx: PluginContext,
  companyId: string,
  config: VkPluginConfig,
): VkEventProcessor {
  const journal = new VkEventJournal(ctx.db);
  const router = new EventRouter({
    companyId,
    assignedAgents: config.assignedAgents,
    automationSettings: config.automationSettings,
    invokeAgent: async (agentId, targetCompanyId, opts) => {
      return ctx.agents.invoke(agentId, targetCompanyId, opts);
    },
    logger: ctx.logger,
  });

  return new VkEventProcessor({
    companyId,
    groupId: config.groupId,
    journal,
    router,
    maxActionsPerHourPerPeer: config.automationSettings?.maxRepliesPerHourPerUser ?? 10,
  });
}

async function startLongPollForCompany(
  ctx: PluginContext,
  companyId: string,
  config: VkPluginConfig,
): Promise<void> {
  const existing = activePollers.get(companyId);
  if (existing) {
    existing.stop();
    activePollers.delete(companyId);
  }

  if (config.eventTransport !== "long_poll") {
    return;
  }

  let groupToken: string | null = null;
  try {
    groupToken = await ctx.secrets.resolve(config.groupTokenRef as any);
  } catch (err: any) {
    ctx.logger.error(`[VK LongPoll] Cannot resolve group token for company ${companyId}: ${err.message}`);
    return;
  }

  if (!groupToken) return;

  const processor = createProcessor(ctx, companyId, config);

  let initialCursor: VkLongPollCursor | null = null;
  try {
    const saved = (await ctx.state.get({
      scopeKind: "company",
      scopeId: companyId,
      namespace: "vk-longpoll",
      stateKey: "cursor",
    })) as VkLongPollCursor | null;
    if (saved?.server && saved?.key && saved?.ts) {
      initialCursor = saved;
    }
  } catch {
    // Soft ignore cursor load failure
  }

  const fetchFn = ctx.http?.fetch
    ? (url: string | URL | Request, init?: RequestInit) => ctx.http.fetch(url.toString(), init)
    : globalThis.fetch;

  const poller = new VkLongPollClient({
    groupId: config.groupId,
    apiVersion: config.apiVersion ?? "5.199",
    groupToken,
    fetchFn: fetchFn as any,
    initialCursor,
    onCursor: async (cursor) => {
      try {
        if (cursor) {
          await ctx.state.set(
            {
              scopeKind: "company",
              scopeId: companyId,
              namespace: "vk-longpoll",
              stateKey: "cursor",
            },
            cursor,
          );
        } else {
          await ctx.state.delete({
            scopeKind: "company",
            scopeId: companyId,
            namespace: "vk-longpoll",
            stateKey: "cursor",
          });
        }
      } catch (err: any) {
        ctx.logger.warn(`[VK LongPoll] Cursor persist failed: ${err?.message}`);
      }
    },
    onEvent: async (rawEvent) => {
      try {
        await processor.process(rawEvent, "long_poll");
      } catch (err: any) {
        ctx.logger.error(`[VK LongPoll] Event processing error: ${err?.message}`);
      }
    },
    logger: ctx.logger,
  });

  activePollers.set(companyId, poller);
  void poller.start();
  ctx.logger.info(`[VK LongPoll] Poller started for group ${config.groupId} (company: ${companyId})`);
}

export const plugin = definePlugin({
  multiCompanyConfig: true,

  async setup(ctx: PluginContext) {
    pluginContext = ctx;

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
          eventTransport: config.eventTransport ?? "disabled",
          assignedAgents: config.assignedAgents ?? {},
          automationSettings: config.automationSettings ?? {},
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
    const summaryCacheTtlMs = 12 * 60 * 60 * 1000;
    ctx.data.register("vk-community-summary", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      const force = params?.force === true;
      const cacheKey = companyId
        ? { scopeKind: "company" as const, scopeId: companyId, namespace: "vk-dashboard", stateKey: "summary" }
        : null;
      let cached: any = null;

      if (cacheKey) {
        try {
          cached = await ctx.state.get(cacheKey);
          if (!force && cached?.data && Date.parse(cached.expiresAt) > Date.now()) {
            return { ...cached.data, cached: true };
          }
        } catch {
          // Cache failure must not break the widget.
        }
      }

      try {
        const { client, config } = await resolveClient(ctx, companyId);

        const groupsRes = await client.call<any[]>(
          "groups.getById",
          { group_id: config.groupId, fields: ["members_count", "verified", "activity"] },
          "group",
        );
        const group = Array.isArray(groupsRes) ? groupsRes[0] : (groupsRes as any)?.groups?.[0];

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

        const refreshedAt = new Date().toISOString();
        const nextRefreshAt = new Date(Date.now() + summaryCacheTtlMs).toISOString();
        const summary = {
          ok: true,
          groupId: config.groupId,
          name: group?.name ?? `Club #${config.groupId}`,
          screenName: group?.screen_name ?? "",
          photo: group?.photo_100 ?? group?.photo_50 ?? "",
          membersCount: group?.members_count ?? 0,
          unansweredMessages: unansweredCount,
          latestPostTime,
          eventTransport: config.eventTransport ?? "disabled",
          refreshedAt,
          nextRefreshAt,
        };

        if (cacheKey) {
          try {
            await ctx.state.set(cacheKey, { data: summary, expiresAt: nextRefreshAt });
          } catch {
            // Cache failure must not turn a successful VK response into an error.
          }
        }

        return { ...summary, cached: false };
      } catch (err: any) {
        if (cached?.data) {
          return { ...cached.data, cached: true, stale: true };
        }
        return {
          ok: false,
          error: err.message ?? String(err),
          refreshedAt: new Date().toISOString(),
        };
      }
    });

    // 4. Data bridge: vk-recent-events (for dashboard & settings activity feed)
    ctx.data.register("vk-recent-events", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      if (!companyId) return [];
      try {
        const journal = new VkEventJournal(ctx.db);
        const limit = typeof params?.limit === "number" ? params.limit : 20;
        return await journal.listRecent(companyId, limit);
      } catch (err: any) {
        ctx.logger.error(`[VK Events] Failed to list recent events: ${err.message}`);
        return [];
      }
    });

    // 5. Data bridge: company-agents (for settings dropdown selection)
    ctx.data.register("company-agents", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      if (!companyId) return [];
      try {
        return await ctx.agents.list({ companyId, status: "active", limit: 100 });
      } catch (err: any) {
        ctx.logger.error(`[VK Events] Failed to list agents: ${err.message}`);
        return [];
      }
    });

    // 6. Data bridge: company-scoped event settings
    ctx.data.register("vk-event-settings", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      if (!companyId) return null;
      const { config } = await resolveClient(ctx, companyId);
      return {
        eventTransport: config.eventTransport ?? "disabled",
        callbackConfirmationCode: config.callbackConfirmationCode ?? "",
        assignedAgents: config.assignedAgents ?? {},
        automationSettings: config.automationSettings ?? {},
      };
    });

    // 7. Action: save company-scoped event settings without touching secrets
    ctx.actions.register("save-event-settings", async (params: any) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : undefined;
      if (!companyId) throw new Error("companyId is required");

      const eventTransport =
        params?.eventTransport === "callback" || params?.eventTransport === "long_poll"
          ? params.eventTransport
          : "disabled";
      const assigned = params?.assignedAgents && typeof params.assignedAgents === "object"
        ? params.assignedAgents as Record<string, unknown>
        : {};
      const automation = params?.automationSettings && typeof params.automationSettings === "object"
        ? params.automationSettings as Record<string, unknown>
        : {};
      const maxReplies = Number(automation.maxRepliesPerHourPerUser ?? 10);
      if (!Number.isInteger(maxReplies) || maxReplies < 1 || maxReplies > 100) {
        throw new Error("maxRepliesPerHourPerUser must be an integer from 1 to 100");
      }

      const settings: Partial<VkPluginConfig> = {
        eventTransport,
        callbackConfirmationCode:
          typeof params?.callbackConfirmationCode === "string"
            ? params.callbackConfirmationCode.trim()
            : "",
        assignedAgents: {
          supportAgentId: typeof assigned.supportAgentId === "string" && assigned.supportAgentId.trim()
            ? assigned.supportAgentId.trim()
            : null,
          moderationAgentId: typeof assigned.moderationAgentId === "string" && assigned.moderationAgentId.trim()
            ? assigned.moderationAgentId.trim()
            : null,
          financeAgentId: typeof assigned.financeAgentId === "string" && assigned.financeAgentId.trim()
            ? assigned.financeAgentId.trim()
            : null,
        },
        automationSettings: {
          emergencyKillSwitch: automation.emergencyKillSwitch === true,
          maxRepliesPerHourPerUser: maxReplies,
        },
      };

      await ctx.state.set(
        {
          scopeKind: "company",
          scopeId: companyId,
          namespace: "vk-events",
          stateKey: "settings",
        },
        settings,
      );

      const { config } = await resolveClient(ctx, companyId);
      await startLongPollForCompany(ctx, companyId, config);
      return { success: true };
    });

    // 8. Action: test-connection (interactive refresh in settings)
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

    // 7. Initialize Long Poll for active companies
    try {
      const companies = await ctx.companies.list({ limit: 100 });
      for (const comp of companies) {
        try {
          const rawConfig = await ctx.config.get(comp.id);
          const validated = validateVkPluginConfig(rawConfig);
          if (validated.valid && validated.config?.eventTransport === "long_poll") {
            await startLongPollForCompany(ctx, comp.id, validated.config);
          }
        } catch {
          // Company might not have plugin configured yet
        }
      }
    } catch (err: any) {
      ctx.logger.warn(`[VK Setup] Could not enumerate companies on setup: ${err?.message}`);
    }
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

  async onConfigChanged(
    newConfig: Record<string, unknown>,
    context?: PluginConfigChangeContext,
  ): Promise<void> {
    if (!pluginContext) return;
    const validated = validateVkPluginConfig(newConfig);
    const targetCompanyId = context?.companyId;

    if (!targetCompanyId || !validated.valid || !validated.config) {
      return;
    }

    if (validated.config.eventTransport === "long_poll") {
      await startLongPollForCompany(pluginContext, targetCompanyId, validated.config);
    } else {
      const existing = activePollers.get(targetCompanyId);
      if (existing) {
        existing.stop();
        activePollers.delete(targetCompanyId);
      }
    }
  },

  async onWebhook(input: PluginWebhookInput): Promise<void> {
    if (input.endpointKey !== "vk-callback" || !pluginContext) {
      return;
    }

    let payload: RawVkEvent;
    try {
      payload = (input.parsedBody ?? JSON.parse(input.rawBody)) as RawVkEvent;
    } catch {
      pluginContext.logger.error("[VK Callback] Webhook body is not valid JSON");
      return;
    }

    const eventType = typeof payload?.type === "string" ? payload.type : "";
    const groupId = Number(payload?.group_id);
    if (!groupId) {
      return;
    }

    if (eventType === "confirmation") {
      return;
    }

    const ctx = pluginContext;
    try {
      const companies = await ctx.companies.list({ limit: 100 });
      for (const comp of companies) {
        const rawConfig = await ctx.config.get(comp.id);
        const validated = validateVkPluginConfig(rawConfig);
        if (validated.valid && validated.config && validated.config.groupId === groupId) {
          let expectedSecret: string | undefined;
          if (validated.config.callbackSecretRef) {
            try {
              expectedSecret = (await ctx.secrets.resolve(validated.config.callbackSecretRef as any)) ?? undefined;
            } catch (secErr: any) {
              ctx.logger.error(`[VK Callback] Failed to resolve callbackSecretRef: ${secErr.message}`);
              return;
            }
          }

          const validation = validateCallbackRequest(payload, {
            expectedGroupId: groupId,
            confirmationCode: validated.config.callbackConfirmationCode ?? "",
            secret: expectedSecret,
          });

          if (!validation.valid) {
            ctx.logger.warn(`[VK Callback] Rejected invalid payload: ${validation.error}`);
            return;
          }

          const processor = createProcessor(ctx, comp.id, validated.config);
          await processor.process(payload, "callback");
          return;
        }
      }
      ctx.logger.warn(`[VK Callback] Received event for unknown groupId ${groupId}`);
    } catch (err: any) {
      ctx.logger.error(`[VK Callback] Error dispatching webhook event: ${err?.message}`);
    }
  },

  async onShutdown(): Promise<void> {
    for (const [companyId, poller] of activePollers.entries()) {
      poller.stop();
      activePollers.delete(companyId);
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
