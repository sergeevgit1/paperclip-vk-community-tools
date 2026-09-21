import { EventDeduplicator } from "./dedupe.js";
import type { VkEventJournal } from "./journal.js";
import type { EventRouter, EventRoutingResult } from "./router.js";
import type { RawVkEvent, VkEventTransport } from "./types.js";
import { normalizeVkEvent } from "./validator.js";

export interface EventProcessorOptions {
  companyId: string;
  groupId: number;
  journal: VkEventJournal;
  router: EventRouter;
  guard?: EventDeduplicator;
  maxActionsPerHourPerPeer?: number;
}

export interface ProcessEventResult {
  status: "processed" | "duplicate" | "ignored_echo" | "rate_limited";
  eventId: string;
  routing?: EventRoutingResult;
}

export class VkEventProcessor {
  private readonly guard: EventDeduplicator;

  constructor(private readonly options: EventProcessorOptions) {
    this.guard = options.guard ?? new EventDeduplicator();
  }

  public async process(
    raw: RawVkEvent,
    transport: VkEventTransport,
  ): Promise<ProcessEventResult> {
    const event = normalizeVkEvent(
      { ...raw, group_id: raw.group_id ?? this.options.groupId },
      transport,
    );

    if (event.groupId !== this.options.groupId) {
      throw new Error(
        `Event group mismatch: expected ${this.options.groupId}, got ${event.groupId}`,
      );
    }

    // Durable INSERT is the source of truth for deduplication.
    const received = await this.options.journal.receive(
      this.options.companyId,
      event,
    );
    if (!received.inserted) {
      return { status: "duplicate", eventId: event.id };
    }

    if (
      this.guard.isCommunityEcho({
        actorUserId: event.actorUserId,
        groupId: event.groupId,
        type: event.type,
      })
    ) {
      const routing: EventRoutingResult = {
        actionTaken: "ignored_echo",
        assignedAgentId: null,
        reason: "Event originated from the community or is an outgoing echo",
      };
      await this.options.journal.complete(this.options.companyId, event, routing);
      return { status: "ignored_echo", eventId: event.id, routing };
    }

    const limit = this.options.maxActionsPerHourPerPeer ?? 10;
    if (
      event.peerId !== undefined &&
      !this.guard.checkRateLimit(event.peerId, limit)
    ) {
      const routing: EventRoutingResult = {
        actionTaken: "rate_limited",
        assignedAgentId: null,
        reason: `Per-peer hourly action limit reached (${limit})`,
      };
      await this.options.journal.complete(this.options.companyId, event, routing);
      return { status: "rate_limited", eventId: event.id, routing };
    }

    try {
      const routing = await this.options.router.routeEvent(event);
      if (event.peerId !== undefined && routing.actionTaken === "invoked_agent") {
        this.guard.recordAction(event.peerId);
      }
      await this.options.journal.complete(this.options.companyId, event, routing);
      return { status: "processed", eventId: event.id, routing };
    } catch (error) {
      await this.options.journal.fail(this.options.companyId, event, error);
      throw error;
    }
  }
}
