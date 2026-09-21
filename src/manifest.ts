import type {
  PaperclipPluginManifestV1,
  PluginToolDeclaration,
} from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";
import type { VkPluginConfig } from "./types.js";

const TOOL_DEFINITIONS: PluginToolDeclaration[] = [
  // 1-2: Community Identity & Membership
  {
    name: "vk_group_get_details",
    displayName: "VK Group Get Details",
    description:
      "Reads VK community details: name, description, status, photo, cover, member count, and features.",
    parametersSchema: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Optional extra fields to request (e.g. description, members_count, status, site).",
        },
      },
    },
  },
  {
    name: "vk_group_is_member",
    displayName: "VK Group Is Member",
    description: "Checks whether a specified VK user is a member of the community.",
    parametersSchema: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: {
          type: "integer",
          description: "VK User ID to check membership for.",
        },
      },
    },
  },

  // 3-8: Wall Publishing & Lifecycle
  {
    name: "vk_wall_post",
    displayName: "VK Wall Post",
    description: "Publishes a post to the community wall from the community name.",
    parametersSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Post text content (up to 16KB)." },
        attachments: {
          type: "array",
          items: { type: "string" },
          description: "List of VK attachment descriptors, e.g. photo123_456, doc123_456.",
        },
        publishDate: {
          type: "integer",
          description: "Unix timestamp for postponed/scheduled publication.",
        },
        muteNotifications: {
          type: "boolean",
          description: "Whether to mute notifications for subscribers.",
        },
        closeComments: {
          type: "boolean",
          description: "Whether to disable comments on this post.",
        },
      },
    },
  },
  {
    name: "vk_wall_edit",
    displayName: "VK Wall Edit",
    description: "Modifies an existing published or postponed wall post.",
    parametersSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "integer", description: "ID of the post to edit." },
        message: { type: "string", description: "Updated post text." },
        attachments: {
          type: "array",
          items: { type: "string" },
          description: "Updated list of attachment strings.",
        },
        publishDate: {
          type: "integer",
          description: "Updated scheduled publication timestamp.",
        },
      },
    },
  },
  {
    name: "vk_wall_delete",
    displayName: "VK Wall Delete",
    description: "Deletes a post from the community wall.",
    parametersSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "integer", description: "ID of the post to delete." },
      },
    },
  },
  {
    name: "vk_wall_get",
    displayName: "VK Wall Get",
    description: "Retrieves a paginated list of posts from the community wall.",
    parametersSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["owner", "postponed", "suggested"],
          default: "owner",
        },
        count: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "vk_wall_pin",
    displayName: "VK Wall Pin",
    description: "Pins a post to the top of the community wall.",
    parametersSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "integer", description: "ID of the post to pin." },
      },
    },
  },
  {
    name: "vk_wall_unpin",
    displayName: "VK Wall Unpin",
    description: "Unpins a post from the top of the community wall.",
    parametersSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "integer", description: "ID of the post to unpin." },
      },
    },
  },

  // 9-12: Media Uploads
  {
    name: "vk_media_upload_photo",
    displayName: "VK Media Upload Photo",
    description:
      "Uploads an image from a public URL to the community wall using the 3-step VK photo protocol.",
    parametersSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "Public HTTPS URL of the image to fetch and upload.",
        },
        caption: { type: "string", description: "Optional photo caption." },
      },
    },
  },
  {
    name: "vk_media_upload_document",
    displayName: "VK Media Upload Document",
    description: "Uploads a document file from a public HTTPS URL to the community wall.",
    parametersSchema: {
      type: "object",
      required: ["url", "title"],
      properties: {
        url: {
          type: "string",
          description: "Public HTTPS URL of the file to upload.",
        },
        title: { type: "string", description: "Document title/filename." },
        tags: { type: "string", description: "Optional document tags." },
      },
    },
  },
  {
    name: "vk_media_upload_video",
    displayName: "VK Media Upload Video",
    description:
      "Initiates a video upload to the community (video.save) and returns upload URL and attachment descriptor.",
    parametersSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Video title." },
        description: { type: "string", description: "Video description." },
        isPrivate: { type: "boolean", default: false },
        wallpost: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "vk_media_create_poll",
    displayName: "VK Media Create Poll",
    description: "Creates a poll for attachment to community wall posts.",
    parametersSchema: {
      type: "object",
      required: ["question", "answers"],
      properties: {
        question: { type: "string", description: "Poll question." },
        answers: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 10,
          description: "Array of 2 to 10 answer options.",
        },
        isAnonymous: { type: "boolean", default: false },
        isMultiple: { type: "boolean", default: false },
        endDate: { type: "integer", description: "Optional poll end timestamp." },
      },
    },
  },

  // 13-17: Comments & Moderation
  {
    name: "vk_comments_get",
    displayName: "VK Comments Get",
    description: "Retrieves comments for a specific community post.",
    parametersSchema: {
      type: "object",
      required: ["postId"],
      properties: {
        postId: { type: "integer", description: "Wall post ID." },
        count: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
        sort: { type: "string", enum: ["asc", "desc"], default: "asc" },
      },
    },
  },
  {
    name: "vk_comments_create",
    displayName: "VK Comments Create",
    description: "Creates a comment on a wall post on behalf of the community.",
    parametersSchema: {
      type: "object",
      required: ["postId", "message"],
      properties: {
        postId: { type: "integer", description: "Post ID to comment on." },
        message: { type: "string", description: "Comment text." },
        replyToCommentId: {
          type: "integer",
          description: "Comment ID to reply to.",
        },
        attachments: {
          type: "array",
          items: { type: "string" },
          description: "Optional attachment strings.",
        },
      },
    },
  },
  {
    name: "vk_comments_delete",
    displayName: "VK Comments Delete",
    description: "Deletes a comment from the community wall.",
    parametersSchema: {
      type: "object",
      required: ["commentId"],
      properties: {
        commentId: { type: "integer", description: "Comment ID to delete." },
      },
    },
  },
  {
    name: "vk_members_ban",
    displayName: "VK Members Ban",
    description: "Bans a user from the VK community (adds to blacklist).",
    parametersSchema: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: { type: "integer", description: "User ID to ban." },
        endDate: {
          type: "integer",
          description: "Unix timestamp when ban ends (0 for permanent).",
          default: 0,
        },
        reason: {
          type: "integer",
          description: "0-other, 1-spam, 2-verbal abuse, 3-strong language, 4-irrelevant messages.",
          default: 0,
        },
        comment: { type: "string", description: "Internal moderator note." },
      },
    },
  },
  {
    name: "vk_members_unban",
    displayName: "VK Members Unban",
    description: "Removes a user from the VK community blacklist.",
    parametersSchema: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: { type: "integer", description: "User ID to unban." },
      },
    },
  },

  // 18-21: Community Direct Messages
  {
    name: "vk_messages_get_conversations",
    displayName: "VK Messages Get Conversations",
    description: "Retrieves direct message conversations with the VK community inbox.",
    parametersSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "unread", "unanswered", "important"],
          default: "all",
        },
        count: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "vk_messages_get_history",
    displayName: "VK Messages Get History",
    description: "Retrieves message history with a specific peer/user.",
    parametersSchema: {
      type: "object",
      required: ["peerId"],
      properties: {
        peerId: { type: "integer", description: "User or chat peer ID." },
        count: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "vk_messages_send",
    displayName: "VK Messages Send",
    description: "Sends a direct message to a user on behalf of the community.",
    parametersSchema: {
      type: "object",
      required: ["peerId", "message"],
      properties: {
        peerId: { type: "integer", description: "Target user ID." },
        message: { type: "string", description: "Message text." },
        randomId: {
          type: "integer",
          description: "Unique integer for idempotency (auto-generated if omitted).",
        },
        attachments: {
          type: "array",
          items: { type: "string" },
          description: "Optional attachment strings.",
        },
      },
    },
  },
  {
    name: "vk_messages_mark_as_read",
    displayName: "VK Messages Mark As Read",
    description: "Marks incoming messages from a peer as read.",
    parametersSchema: {
      type: "object",
      required: ["peerId"],
      properties: {
        peerId: { type: "integer", description: "Target user ID." },
      },
    },
  },

  // 22-23: Analytics & Performance
  {
    name: "vk_stats_get_summary",
    displayName: "VK Stats Get Summary",
    description: "Retrieves community engagement and visitor statistics.",
    parametersSchema: {
      type: "object",
      properties: {
        timestampFrom: {
          type: "integer",
          description: "Start timestamp for stats window.",
        },
        timestampTo: {
          type: "integer",
          description: "End timestamp for stats window.",
        },
        intervalsCount: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          default: 7,
          description: "Number of daily intervals.",
        },
      },
    },
  },
  {
    name: "vk_stats_get_post_reach",
    displayName: "VK Stats Get Post Reach",
    description: "Retrieves detailed reach and engagement statistics for wall posts.",
    parametersSchema: {
      type: "object",
      required: ["postIds"],
      properties: {
        postIds: {
          type: "array",
          items: { type: "integer" },
          minItems: 1,
          maxItems: 300,
          description: "Array of post IDs to inspect reach for.",
        },
      },
    },
  },
];

export const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "VK Community Tools",
  description:
    "Complete VK group integration: wall publishing, media, messages, comments, analytics, connector page, and dashboard widget.",
  author: "Openser",
  categories: ["connector", "ui", "automation"],
  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "secrets.read-ref",
    "instance.settings.register",
    "ui.dashboardWidget.register",
    "webhooks.receive",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "plugin.state.read",
    "plugin.state.write",
    "companies.read",
    "agents.read",
    "agents.invoke",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  database: {
    namespaceSlug: "vk_community_tools",
    migrationsDir: "migrations",
  },
  webhooks: [
    {
      endpointKey: "vk-callback",
      displayName: "VK Callback API",
      description: "Receives VK events forwarded by a compatible callback gateway.",
    },
  ],
  instanceConfigSchema: {
    type: "object",
    additionalProperties: false,
    required: ["groupId", "userTokenRef", "groupTokenRef"],
    properties: {
      groupId: {
        type: "integer",
        minimum: 1,
        title: "VK Group ID",
        description: "Numeric ID of the VK community without minus sign (e.g. 229871234)",
      },
      userTokenRef: {
        title: "VK User Access Token (Secret Reference)",
        format: "secret-ref",
        oneOf: [
          { type: "string", minLength: 1 },
          {
            type: "object",
            required: ["type", "secretId"],
            properties: {
              type: { type: "string", const: "secret_ref" },
              secretId: { type: "string", minLength: 1 },
              version: {
                oneOf: [
                  { type: "string", const: "latest" },
                  { type: "integer", minimum: 1 },
                ],
              },
            },
          },
        ],
      },
      groupTokenRef: {
        title: "VK Group Access Token (Secret Reference)",
        format: "secret-ref",
        oneOf: [
          { type: "string", minLength: 1 },
          {
            type: "object",
            required: ["type", "secretId"],
            properties: {
              type: { type: "string", const: "secret_ref" },
              secretId: { type: "string", minLength: 1 },
              version: {
                oneOf: [
                  { type: "string", const: "latest" },
                  { type: "integer", minimum: 1 },
                ],
              },
            },
          },
        ],
      },
      apiVersion: {
        type: "string",
        default: "5.199",
        title: "VK API Version",
      },
      rateLimitRps: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        default: 3,
        title: "Max Requests Per Second",
      },
      eventTransport: {
        type: "string",
        enum: ["callback", "long_poll", "disabled"],
        default: "disabled",
        title: "Event Transport",
        description: "Mechanism used to ingest real-time VK community events.",
      },
      callbackConfirmationCode: {
        type: "string",
        title: "Callback Confirmation Code",
        description: "Required response string when configuring Callback API server in VK.",
      },
      callbackSecretRef: {
        title: "Callback Secret Key (Secret Reference)",
        format: "secret-ref",
        oneOf: [
          { type: "string", minLength: 1 },
          {
            type: "object",
            required: ["type", "secretId"],
            properties: {
              type: { type: "string", const: "secret_ref" },
              secretId: { type: "string", minLength: 1 },
              version: {
                oneOf: [
                  { type: "string", const: "latest" },
                  { type: "integer", minimum: 1 },
                ],
              },
            },
          },
        ],
      },
      assignedAgents: {
        type: "object",
        title: "Assigned Agents",
        description: "Agent routing configuration for support, moderation, and finance.",
        properties: {
          supportAgentId: {
            type: ["string", "null"],
            description: "Agent ID responsible for direct messages and support inquiries.",
          },
          moderationAgentId: {
            type: ["string", "null"],
            description: "Agent ID responsible for wall and market comments moderation.",
          },
          financeAgentId: {
            type: ["string", "null"],
            description: "Agent ID responsible for Donut and VK Market payment notifications.",
          },
        },
      },
      automationSettings: {
        type: "object",
        title: "Automation Settings",
        properties: {
          emergencyKillSwitch: {
            type: "boolean",
            default: false,
            description: "When true, halts all automated outbound messages and actions.",
          },
          maxRepliesPerHourPerUser: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Anti-loop rate limit per user per hour.",
          },
        },
      },
    },
  },
  tools: TOOL_DEFINITIONS,
  ui: {
    slots: [
      {
        type: "companySettingsPage",
        id: "vk-settings",
        displayName: "VK Community Settings",
        exportName: "VkCompanySettingsPage",
        routePath: "vk-community",
      },
      {
        type: "dashboardWidget",
        id: "vk-dashboard-widget",
        displayName: "VK Community",
        exportName: "VkDashboardWidget",
      },
    ],
  },
};

export function validateVkPluginConfig(raw: unknown): {
  valid: boolean;
  errors?: string[];
  config?: VkPluginConfig;
} {
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Configuration must be an object"] };
  }

  const data = raw as Record<string, unknown>;
  const errors: string[] = [];

  const groupId = Number(data.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    errors.push("groupId must be a positive integer");
  }

  function validateSecretRef(field: string, val: unknown) {
    if (!val) {
      errors.push(`${field} is required`);
      return;
    }

    if (typeof val === "string") {
      if (!val.trim()) {
        errors.push(`${field} must not be empty`);
      } else if (val.startsWith("vk1.a.")) {
        errors.push(
          `${field} must be a Paperclip secret reference, not a plaintext token`,
        );
      }
      return;
    }

    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (obj.type !== "secret_ref" || typeof obj.secretId !== "string" || !obj.secretId.trim()) {
        errors.push(
          `${field} must be a valid secret_ref object with secretId`,
        );
      }
      return;
    }

    errors.push(`${field} must be a string or secret_ref object`);
  }

  validateSecretRef("userTokenRef", data.userTokenRef);
  validateSecretRef("groupTokenRef", data.groupTokenRef);

  const eventTransport = data.eventTransport ?? "disabled";
  if (
    eventTransport !== "callback" &&
    eventTransport !== "long_poll" &&
    eventTransport !== "disabled"
  ) {
    errors.push("eventTransport must be callback, long_poll, or disabled");
  }

  if (data.callbackSecretRef !== undefined) {
    validateSecretRef("callbackSecretRef", data.callbackSecretRef);
  }

  const assignedAgents =
    data.assignedAgents && typeof data.assignedAgents === "object"
      ? (data.assignedAgents as Record<string, unknown>)
      : {};
  for (const field of ["supportAgentId", "moderationAgentId", "financeAgentId"] as const) {
    const value = assignedAgents[field];
    if (value !== undefined && value !== null && (typeof value !== "string" || !value.trim())) {
      errors.push(`assignedAgents.${field} must be a non-empty string or null`);
    }
  }

  const automationSettings =
    data.automationSettings && typeof data.automationSettings === "object"
      ? (data.automationSettings as Record<string, unknown>)
      : {};
  const maxReplies = automationSettings.maxRepliesPerHourPerUser ?? 10;
  if (!Number.isInteger(maxReplies) || Number(maxReplies) < 1 || Number(maxReplies) > 100) {
    errors.push("automationSettings.maxRepliesPerHourPerUser must be an integer from 1 to 100");
  }
  if (
    automationSettings.emergencyKillSwitch !== undefined &&
    typeof automationSettings.emergencyKillSwitch !== "boolean"
  ) {
    errors.push("automationSettings.emergencyKillSwitch must be a boolean");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    config: {
      groupId,
      userTokenRef: data.userTokenRef as any,
      groupTokenRef: data.groupTokenRef as any,
      apiVersion: typeof data.apiVersion === "string" ? data.apiVersion : "5.199",
      rateLimitRps:
        typeof data.rateLimitRps === "number" && data.rateLimitRps > 0
          ? data.rateLimitRps
          : 3,
      eventTransport: eventTransport as "callback" | "long_poll" | "disabled",
      callbackConfirmationCode:
        typeof data.callbackConfirmationCode === "string"
          ? data.callbackConfirmationCode
          : undefined,
      callbackSecretRef: data.callbackSecretRef as any,
      assignedAgents: {
        supportAgentId: (assignedAgents.supportAgentId as string | null | undefined) ?? null,
        moderationAgentId: (assignedAgents.moderationAgentId as string | null | undefined) ?? null,
        financeAgentId: (assignedAgents.financeAgentId as string | null | undefined) ?? null,
      },
      automationSettings: {
        emergencyKillSwitch: automationSettings.emergencyKillSwitch === true,
        maxRepliesPerHourPerUser: Number(maxReplies),
      },
    },
  };
}

export default manifest;
