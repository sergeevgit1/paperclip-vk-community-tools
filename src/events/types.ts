export type VkEventTransport = "callback" | "long_poll";
export type VkEventCategory =
  | "support"
  | "moderation"
  | "payments"
  | "audit"
  | "unknown";

export interface RawVkEvent {
  type?: unknown;
  group_id?: unknown;
  event_id?: unknown;
  object?: unknown;
  secret?: unknown;
  [key: string]: unknown;
}

export interface NormalizedVkEvent {
  id: string;
  groupId: number;
  type: string;
  category: VkEventCategory;
  occurredAt: Date;
  receivedAt: Date;
  peerId?: number;
  actorUserId?: number;
  objectId?: number;
  text?: string;
  transport: VkEventTransport;
  rawPayload: RawVkEvent;
}

export interface CallbackValidationOptions {
  expectedGroupId: number;
  confirmationCode: string;
  secret?: string;
}

export interface CallbackValidationResult {
  valid: boolean;
  isConfirmation: boolean;
  responseBody?: string;
  error?: string;
}
