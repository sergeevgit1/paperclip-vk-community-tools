import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import type { EventRoutingResult } from "./router.js";
import type { NormalizedVkEvent } from "./types.js";

export interface JournalReceiveResult {
  inserted: boolean;
  rowId?: string;
}

export interface JournalEventRow {
  id: string;
  group_id: string | number;
  event_id: string;
  event_type: string;
  category: string;
  peer_id: string | number | null;
  actor_user_id: string | number | null;
  status: string;
  agent_id: string | null;
  agent_run_id: string | null;
  error: string | null;
  created_at: string | Date;
  processed_at: string | Date | null;
}

const SECRET_FIELD_RE = /^(secret|access_token|token|key|authorization)$/i;

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_FIELD_RE.test(key)) continue;
    output[key] = redactSecrets(item);
  }
  return output;
}

function journalStatus(result: EventRoutingResult): string {
  switch (result.actionTaken) {
    case "invoked_agent":
      return "invoked";
    case "kill_switch_halt":
      return "kill_switch";
    case "ignored_echo":
      return "ignored_echo";
    case "rate_limited":
      return "rate_limited";
    case "audit_only":
    default:
      return "audit_only";
  }
}

export class VkEventJournal {
  private readonly table: string;

  constructor(private readonly db: PluginDatabaseClient) {
    this.table = `${db.namespace}.vk_event_journal`;
  }

  public async receive(
    companyId: string,
    event: NormalizedVkEvent,
  ): Promise<JournalReceiveResult> {
    const payloadJson = JSON.stringify(redactSecrets(event.rawPayload));
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO ${this.table}
       (company_id, group_id, event_id, event_type, category, peer_id, actor_user_id, payload, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'received')
       ON CONFLICT (company_id, group_id, event_id) DO NOTHING
       RETURNING id`,
      [
        companyId,
        event.groupId,
        event.id,
        event.type,
        event.category,
        event.peerId ?? null,
        event.actorUserId ?? null,
        payloadJson,
      ],
    );

    const row = rows[0];
    return row ? { inserted: true, rowId: row.id } : { inserted: false };
  }

  public async complete(
    companyId: string,
    event: NormalizedVkEvent,
    result: EventRoutingResult,
  ): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.table}
       SET agent_id = $1,
           agent_run_id = $2,
           error = $3,
           status = $4,
           processed_at = now()
       WHERE company_id = $5 AND group_id = $6 AND event_id = $7`,
      [
        result.assignedAgentId,
        result.agentRunId ?? null,
        result.actionTaken === "audit_only" && result.assignedAgentId
          ? (result.reason ?? null)
          : null,
        journalStatus(result),
        companyId,
        event.groupId,
        event.id,
      ],
    );
  }

  public async fail(
    companyId: string,
    event: NormalizedVkEvent,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.execute(
      `UPDATE ${this.table}
       SET status = 'failed', error = $1, processed_at = now()
       WHERE company_id = $2 AND group_id = $3 AND event_id = $4`,
      [message.slice(0, 4000), companyId, event.groupId, event.id],
    );
  }

  public async listRecent(companyId: string, limit = 20): Promise<JournalEventRow[]> {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    return this.db.query<JournalEventRow>(
      `SELECT id, group_id, event_id, event_type, category, peer_id, actor_user_id,
              status, agent_id, agent_run_id, error, created_at, processed_at
       FROM ${this.table}
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [companyId, safeLimit],
    );
  }
}
