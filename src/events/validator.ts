import crypto from "node:crypto";
import type {
  CallbackValidationOptions,
  CallbackValidationResult,
  NormalizedVkEvent,
  RawVkEvent,
  VkEventCategory,
  VkEventTransport,
} from "./types.js";

const CATEGORY_MAP: Record<string, VkEventCategory> = {
  // Support & Direct Messages
  message_new: "support",
  message_reply: "support",
  message_edit: "support",
  message_allow: "support",
  message_deny: "support",

  // Moderation & Comments
  wall_reply_new: "moderation",
  wall_reply_edit: "moderation",
  wall_reply_delete: "moderation",
  wall_reply_restore: "moderation",
  wall_post_new: "moderation",
  market_comment_new: "moderation",
  market_comment_edit: "moderation",
  market_comment_delete: "moderation",

  // Payments & Subscriptions
  donut_subscription_create: "payments",
  donut_subscription_prolonged: "payments",
  donut_subscription_cancelled: "payments",
  donut_subscription_price_changed: "payments",
  donut_subscription_expired: "payments",
  donut_money_withdraw: "payments",
  donut_money_withdraw_error: "payments",
  market_order_new: "payments",
  market_order_edit: "payments",

  // Audit & Community Life
  group_join: "audit",
  group_leave: "audit",
  user_block: "audit",
  user_unblock: "audit",
  poll_vote_new: "audit",
};

export function validateCallbackRequest(
  payload: unknown,
  options: CallbackValidationOptions,
): CallbackValidationResult {
  if (!payload || typeof payload !== "object") {
    return { valid: false, isConfirmation: false, error: "Invalid payload" };
  }

  const data = payload as RawVkEvent;
  const eventType = typeof data.type === "string" ? data.type : "";
  const groupId = Number(data.group_id);

  if (groupId !== options.expectedGroupId) {
    return {
      valid: false,
      isConfirmation: false,
      error: `Group ID mismatch: expected ${options.expectedGroupId}, got ${groupId}`,
    };
  }

  if (eventType === "confirmation") {
    return {
      valid: true,
      isConfirmation: true,
      responseBody: options.confirmationCode,
    };
  }

  if (options.secret && options.secret.trim().length > 0) {
    const receivedSecret = typeof data.secret === "string" ? data.secret : "";
    if (receivedSecret !== options.secret) {
      return {
        valid: false,
        isConfirmation: false,
        error: "Secret mismatch",
      };
    }
  }

  return {
    valid: true,
    isConfirmation: false,
    responseBody: "ok",
  };
}

export function normalizeVkEvent(
  raw: RawVkEvent,
  transport: VkEventTransport,
): NormalizedVkEvent {
  const eventType = typeof raw.type === "string" ? raw.type : "unknown";
  const groupId = Number(raw.group_id) || 0;
  const category = CATEGORY_MAP[eventType] ?? "unknown";

  const obj = (raw.object && typeof raw.object === "object"
    ? raw.object
    : {}) as Record<string, unknown>;

  // VK sends message_new with { message: { ... }, client_info: { ... } }
  const messageObj =
    obj.message && typeof obj.message === "object"
      ? (obj.message as Record<string, unknown>)
      : obj;

  const peerId =
    typeof messageObj.peer_id === "number"
      ? messageObj.peer_id
      : typeof obj.peer_id === "number"
        ? obj.peer_id
        : undefined;

  const actorUserId =
    typeof messageObj.from_id === "number"
      ? messageObj.from_id
      : typeof obj.user_id === "number"
        ? obj.user_id
        : typeof obj.from_id === "number"
          ? obj.from_id
          : undefined;

  const objectId =
    typeof messageObj.id === "number"
      ? messageObj.id
      : typeof obj.id === "number"
        ? obj.id
        : undefined;

  const text =
    typeof messageObj.text === "string"
      ? messageObj.text
      : typeof obj.text === "string"
        ? obj.text
        : undefined;

  const rawDate =
    typeof messageObj.date === "number"
      ? messageObj.date
      : typeof obj.date === "number"
        ? obj.date
        : Math.floor(Date.now() / 1000);

  const occurredAt = new Date(rawDate * 1000);
  const receivedAt = new Date();

  let id: string;
  if (typeof raw.event_id === "string" && raw.event_id.trim().length > 0) {
    id = raw.event_id.trim();
  } else {
    // Deterministic fallback ID based on group, type, objectId/peerId/date
    const fingerprint = `${groupId}:${eventType}:${objectId ?? ""}:${peerId ?? ""}:${rawDate}`;
    id = crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
  }

  return {
    id,
    groupId,
    type: eventType,
    category,
    occurredAt,
    receivedAt,
    peerId,
    actorUserId,
    objectId,
    text,
    transport,
    rawPayload: raw,
  };
}
