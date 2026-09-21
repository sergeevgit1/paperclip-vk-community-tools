export type SecretRef =
  | string
  | { type: "secret_ref"; secretId: string; version?: "latest" | number };

export type VkEventTransport = "callback" | "long_poll" | "disabled";

export interface VkAssignedAgentsConfig {
  supportAgentId?: string | null;
  moderationAgentId?: string | null;
  financeAgentId?: string | null;
}

export interface VkAutomationSettings {
  emergencyKillSwitch?: boolean;
  maxRepliesPerHourPerUser?: number;
}

export interface VkPluginConfig {
  groupId: number;
  userTokenRef: SecretRef;
  groupTokenRef: SecretRef;
  apiVersion?: string;
  rateLimitRps?: number;
  eventTransport?: VkEventTransport;
  callbackConfirmationCode?: string;
  callbackSecretRef?: SecretRef;
  assignedAgents?: VkAssignedAgentsConfig;
  automationSettings?: VkAutomationSettings;
}

export type VkTokenType = "user" | "group";
export type VkApiParams = Record<
  string,
  string | number | boolean | null | undefined | string[] | number[]
>;

export interface VkCaller {
  call<T = unknown>(
    method: string,
    params?: VkApiParams,
    tokenType?: VkTokenType,
  ): Promise<T>;
  fetchPublicBlob?(url: string, maxBytes?: number): Promise<Blob>;
  uploadFile?(uploadUrl: string, fieldName: string, fileBlob: Blob, filename?: string): Promise<unknown>;
}

export interface ToolSpec {
  name: string;
  displayName: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  tokenType: VkTokenType;
  execute(client: VkCaller, config: VkPluginConfig, params: any): Promise<unknown>;
}
