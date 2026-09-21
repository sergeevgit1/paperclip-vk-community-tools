# VK Events Engine (Support, Moderation, Payments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@zaruba/paperclip-vk-community-tools` with an autonomous event ingestion and routing pipeline (Bots Long Poll & Callback API) for customer support, payments, and wall moderation, strictly governed by the zero-action invariant when no agent is assigned.

**Architecture:** A unified event receiver normalizes incoming VK events from either Long Poll or Callback webhook. Events pass through deduplication and anti-loop filters, then route to the designated agent (support, moderation, finance). If no agent is assigned for a given category, events are stored and surfaced in the UI without invoking LLM models or taking automated actions.

**Tech Stack:** TypeScript 5, Node.js 22, `@paperclipai/plugin-sdk`, Vitest, React 19, esbuild.

---

### File Structure Map

```text
src/
├── constants.ts                    # Updated event types & webhook keys
├── types.ts                        # Event interfaces, assigned agents, normalized payload
├── manifest.ts                     # Webhook declaration & extended config schema
├── events/
│   ├── types.ts                    # Normalized event structure & transport contracts
│   ├── validator.ts                # Secret key & confirmation handshake validation
│   ├── dedupe.ts                   # In-memory / storage deduplication & anti-loop
│   ├── router.ts                   # Category matcher & agent assignment dispatcher
│   └── long-poll.ts                # Bots Long Poll polling daemon
├── worker.ts                       # Registers webhook, supervises poller, links router
└── ui/
    ├── settings.tsx                # Transport switch, agent assignment dropdowns, kill-switch
    └── widget.tsx                  # Dashboard widget with live event velocity & feed
tests/
├── events-validator.spec.ts        # Handshake & signature tests
├── events-dedupe.spec.ts           # Deduplication & anti-recursion tests
├── events-router.spec.ts           # Zero-agent invariant & category dispatch tests
├── long-poll.spec.ts               # Polling loop & failover tests
└── plugin-lifecycle.spec.ts        # End-to-end worker integration tests
```

---

### Task 1: Extend Types & Config Schema

**Files:**
- Modify: `src/types.ts`
- Modify: `src/manifest.ts`
- Test: `tests/config.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/config.spec.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { validateVkPluginConfig } from "../src/manifest.js";

describe("VK Plugin Config Validation for Events", () => {
  it("accepts valid event transport configuration with agent assignments", () => {
    const config = {
      groupId: 238558829,
      userTokenRef: "sec-user",
      groupTokenRef: "sec-group",
      eventTransport: "long_poll",
      assignedAgents: {
        supportAgentId: "00000000-0000-0000-0000-000000000001",
        moderationAgentId: null,
        financeAgentId: "00000000-0000-0000-0000-000000000003",
      },
      automationSettings: {
        emergencyKillSwitch: false,
        maxRepliesPerHourPerUser: 10,
      },
    };
    const res = validateVkPluginConfig(config);
    expect(res.valid).toBe(true);
    expect(res.config?.eventTransport).toBe("long_poll");
    expect(res.config?.assignedAgents?.supportAgentId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rejects invalid eventTransport value", () => {
    const config = {
      groupId: 238558829,
      userTokenRef: "sec-user",
      groupTokenRef: "sec-group",
      eventTransport: "unsupported_transport",
    };
    const res = validateVkPluginConfig(config);
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.includes("eventTransport"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/config.spec.ts`
Expected: FAIL due to missing `eventTransport` schema definition and validation.

- [ ] **Step 3: Update `src/types.ts` and `src/manifest.ts`**

Update `src/types.ts`:
```typescript
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
  userTokenRef: string | { type: "secret_ref"; secretId: string; version?: string | number };
  groupTokenRef: string | { type: "secret_ref"; secretId: string; version?: string | number };
  apiVersion?: string;
  rateLimitRps?: number;
  eventTransport?: VkEventTransport;
  callbackConfirmationCode?: string;
  callbackSecret?: string;
  assignedAgents?: VkAssignedAgentsConfig;
  automationSettings?: VkAutomationSettings;
}
```

Update `src/manifest.ts` to include:
- `webhooks: [{ endpointKey: "vk-callback", displayName: "VK Callback API Webhook" }]`
- `capabilities: [..., "webhooks.receive", "agents.invoke"]`
- Extended `instanceConfigSchema` with `eventTransport`, `callbackConfirmationCode`, `callbackSecret`, `assignedAgents`, `automationSettings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/config.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/manifest.ts tests/config.spec.ts
git commit -m "feat(config): add event transport and agent assignment schemas"
```

---

### Task 2: Event Types & Ingestion Normalizer

**Files:**
- Create: `src/events/types.ts`
- Create: `src/events/validator.ts`
- Test: `tests/events-validator.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/events-validator.spec.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { validateCallbackRequest, normalizeVkEvent } from "../src/events/validator.js";

describe("VK Callback & Event Normalization", () => {
  it("handles confirmation handshake cleanly", () => {
    const payload = {
      type: "confirmation",
      group_id: 238558829,
    };
    const res = validateCallbackRequest(payload, {
      expectedGroupId: 238558829,
      confirmationCode: "test_conf_123",
      secret: "sec_abc",
    });
    expect(res.isConfirmation).toBe(true);
    expect(res.responseBody).toBe("test_conf_123");
  });

  it("verifies secret key for incoming events", () => {
    const payload = {
      type: "message_new",
      group_id: 238558829,
      secret: "wrong_secret",
      object: { message: { id: 1, peer_id: 100, text: "Hello" } },
    };
    const res = validateCallbackRequest(payload, {
      expectedGroupId: 238558829,
      confirmationCode: "test_conf_123",
      secret: "sec_abc",
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Secret mismatch");
  });

  it("normalizes message_new, donut, and wall comment events uniformly", () => {
    const rawMsg = {
      type: "message_new",
      group_id: 238558829,
      event_id: "evt_1",
      object: {
        message: {
          id: 10,
          date: 1726000000,
          peer_id: 555,
          from_id: 555,
          text: "Help please",
        },
      },
    };
    const norm = normalizeVkEvent(rawMsg, "callback");
    expect(norm.category).toBe("support");
    expect(norm.peerId).toBe(555);
    expect(norm.actorUserId).toBe(555);
    expect(norm.text).toBe("Help please");
    expect(norm.transport).toBe("callback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/events-validator.spec.ts`
Expected: FAIL with missing module `src/events/validator.ts`.

- [ ] **Step 3: Implement `src/events/types.ts` and `src/events/validator.ts`**

Define normalized event categories: `"support" | "payments" | "moderation" | "audit" | "unknown"`.
Implement `validateCallbackRequest` and `normalizeVkEvent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/events-validator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/events/types.ts src/events/validator.ts tests/events-validator.spec.ts
git commit -m "feat(events): implement event normalizer and callback validator"
```

---

### Task 3: Deduplication & Anti-Loop Engine

**Files:**
- Create: `src/events/dedupe.ts`
- Test: `tests/events-dedupe.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/events-dedupe.spec.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { EventDeduplicator } from "../src/events/dedupe.js";

describe("Event Deduplicator & Anti-Loop", () => {
  it("filters out duplicate event keys", () => {
    const dedupe = new EventDeduplicator({ ttlMs: 10_000 });
    expect(dedupe.isDuplicate("evt_123")).toBe(false);
    expect(dedupe.isDuplicate("evt_123")).toBe(true);
  });

  it("detects echo messages sent by community itself", () => {
    const dedupe = new EventDeduplicator();
    const isEcho = dedupe.isEchoMessage({
      actorUserId: -238558829,
      communityGroupId: 238558829,
    });
    expect(isEcho).toBe(true);
  });

  it("enforces rate limit per peer to avoid runaway bot loops", () => {
    const dedupe = new EventDeduplicator();
    const peerId = 999;
    for (let i = 0; i < 5; i++) {
      expect(dedupe.checkRateLimit(peerId, 5)).toBe(true);
      dedupe.recordReply(peerId);
    }
    expect(dedupe.checkRateLimit(peerId, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/events-dedupe.spec.ts`
Expected: FAIL with missing module `src/events/dedupe.ts`.

- [ ] **Step 3: Implement `src/events/dedupe.ts`**

Implement `EventDeduplicator` with sliding-window memory store, rate limiter per `peerId`, and community echo detection.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/events-dedupe.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/events/dedupe.ts tests/events-dedupe.spec.ts
git commit -m "feat(events): implement deduplication and anti-loop limiter"
```

---

### Task 4: Bots Long Poll Client

**Files:**
- Create: `src/events/long-poll.ts`
- Test: `tests/long-poll.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/long-poll.spec.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { VkLongPollClient } from "../src/events/long-poll.js";

describe("VK Bots Long Poll Client", () => {
  it("initializes credentials via groups.getLongPollServer and fetches events", async () => {
    const mockFetch = vi.fn();
    // 1. Handshake response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          response: {
            server: "https://lp.vk.com/a123",
            key: "test_key",
            ts: "100",
          },
        }),
      ),
    );
    // 2. Long poll poll response
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ts: "101",
          updates: [
            {
              type: "message_new",
              object: { message: { id: 1, peer_id: 123, text: "Hi" } },
            },
          ],
        }),
      ),
    );

    const received: any[] = [];
    const poller = new VkLongPollClient({
      groupId: 238558829,
      fetchFn: mockFetch,
      groupToken: "vk1.a.group",
      onEvent: async (evt) => {
        received.push(evt);
      },
    });

    await poller.pollOnce();
    expect(received.length).toBe(1);
    expect(received[0].type).toBe("message_new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/long-poll.spec.ts`
Expected: FAIL with missing module `src/events/long-poll.ts`.

- [ ] **Step 3: Implement `src/events/long-poll.ts`**

Implement `VkLongPollClient` supporting:
- Server parameter retrieval (`groups.getLongPollServer`).
- Error handling for `failed: 1` (update `ts`), `failed: 2/3` (re-fetch server parameters).
- Start, stop, and `pollOnce` methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/long-poll.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/events/long-poll.ts tests/long-poll.spec.ts
git commit -m "feat(events): implement Bots Long Poll polling client"
```

---

### Task 5: Agent Router & Zero-Agent Invariant

**Files:**
- Create: `src/events/router.ts`
- Test: `tests/events-router.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/events-router.spec.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { EventRouter } from "../src/events/router.js";
import type { NormalizedVkEvent } from "../src/events/types.js";

describe("Event Router & Zero-Agent Governance", () => {
  it("does NOT invoke agent if category has no assigned agent", async () => {
    const mockInvoke = vi.fn();
    const router = new EventRouter({
      assignedAgents: {
        supportAgentId: null, // No agent assigned!
      },
      invokeAgent: mockInvoke,
    });

    const event: NormalizedVkEvent = {
      id: "evt_1",
      category: "support",
      type: "message_new",
      peerId: 100,
      actorUserId: 100,
      text: "Is anyone there?",
      occurredAt: new Date(),
      rawPayload: {},
      transport: "long_poll",
    };

    const res = await router.routeEvent(event);
    expect(res.actionTaken).toBe("audit_only");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("invokes support agent when assigned", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({ runId: "run-123" });
    const router = new EventRouter({
      assignedAgents: {
        supportAgentId: "agent-support-uuid",
      },
      invokeAgent: mockInvoke,
    });

    const event: NormalizedVkEvent = {
      id: "evt_2",
      category: "support",
      type: "message_new",
      peerId: 100,
      actorUserId: 100,
      text: "Need billing assistance",
      occurredAt: new Date(),
      rawPayload: {},
      transport: "long_poll",
    };

    const res = await router.routeEvent(event);
    expect(res.actionTaken).toBe("invoked_agent");
    expect(mockInvoke).toHaveBeenCalledWith(
      "agent-support-uuid",
      expect.objectContaining({
        prompt: expect.stringContaining("Need billing assistance"),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/events-router.spec.ts`
Expected: FAIL with missing module `src/events/router.ts`.

- [ ] **Step 3: Implement `src/events/router.ts`**

Implement `EventRouter` guaranteeing:
- Category matching: `support` -> `supportAgentId`, `moderation` -> `moderationAgentId`, `payments` -> `financeAgentId`.
- Strictly `audit_only` if agent ID is null or undefined.
- Emergency kill-switch bypasses agent invocation completely.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/events-router.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/events/router.ts tests/events-router.spec.ts
git commit -m "feat(events): implement event router with zero-agent governance"
```

---

### Task 6: Worker Integration & Webhook Handler

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/plugin-lifecycle.spec.ts`

- [ ] **Step 1: Write the failing test**

Extend `tests/plugin-lifecycle.spec.ts` to test:
1. Webhook confirmation code response.
2. Webhook standard event receipt.
3. Long Poll background start/stop during worker lifecycle.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/plugin-lifecycle.spec.ts`
Expected: FAIL due to missing webhook declaration and lifecycle handlers.

- [ ] **Step 3: Integrate into `src/worker.ts`**

- Wire `onWebhook` to handle `vk-callback`.
- Supervise `VkLongPollClient` instance when `eventTransport === "long_poll"`.
- Store recent events in an in-memory ring buffer (and data bridge `vk-recent-events`) for dashboard visibility.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/plugin-lifecycle.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts tests/plugin-lifecycle.spec.ts
git commit -m "feat(worker): wire webhook, long-poll lifecycle, and recent events bridge"
```

---

### Task 7: UI Enhancements (Settings & Widget)

**Files:**
- Modify: `src/ui/settings.tsx`
- Modify: `src/ui/widget.tsx`
- Test: `tests/ui-build.spec.ts`

- [ ] **Step 1: Write UI unit & build tests**

Ensure `tests/ui-build.spec.ts` verifies:
- `VkCompanySettingsPage` renders transport toggles and agent assignment selectors.
- `VkDashboardWidget` displays event count and status.

- [ ] **Step 2: Update UI components**

Update `src/ui/settings.tsx` with:
- Transport selector: `Callback API` vs `Bots Long Poll` vs `Disabled`.
- Agent selector dropdowns for Support, Moderation, and Finance.
- Emergency Kill Switch.
Update `src/ui/widget.tsx` with:
- Event velocity indicator and recent activity feed.

- [ ] **Step 3: Run UI build and test**

Run: `pnpm run build:ui && pnpm test tests/ui-build.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/settings.tsx src/ui/widget.tsx tests/ui-build.spec.ts
git commit -m "feat(ui): add agent assignment controls and live event feed widget"
```

---

### Task 8: Full Verification, Typecheck & Bundle Verification

**Files:**
- Entire repository

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: 100% tests pass (70+ tests).

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: Exit 0, 0 errors.

- [ ] **Step 3: Run production build**

Run: `pnpm run build`
Expected: `dist/worker.js`, `dist/manifest.js`, `dist/ui/index.js` generated cleanly.

- [ ] **Step 4: Commit release readiness**

```bash
git add -A
git commit -m "chore: release-ready verification for vk community events engine"
```
