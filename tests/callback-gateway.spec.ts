import { once } from "node:events";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listen(server: http.Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Нет адреса тестового сервера");
  servers.push(server);
  return `http://127.0.0.1:${address.port}`;
}

async function loadGateway() {
  const filePath = path.resolve(import.meta.dirname, "../callback-gateway/server.mjs");
  return import(pathToFileURL(filePath).href) as Promise<{
    createCallbackGateway: (options: { paperclipWebhookUrl: string; maxBodyBytes?: number }) => http.Server;
  }>;
}

describe("VK Callback Gateway", () => {
  it("возвращает код подтверждения как чистый текст", async () => {
    const { createCallbackGateway } = await loadGateway();
    const gateway = createCallbackGateway({ paperclipWebhookUrl: "http://127.0.0.1:1/webhook" });
    const base = await listen(gateway);

    const response = await fetch(`${base}/callback/123?confirmation=confirm-123&secret=test-secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "confirmation", group_id: 123, secret: "test-secret" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("confirm-123");
  });

  it("пересылает обычное событие в Paperclip и отвечает ok", async () => {
    let forwardedBody: unknown;
    const paperclip = http.createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        forwardedBody = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ deliveryId: "1", status: "success" }));
      });
    });
    const paperclipBase = await listen(paperclip);

    const { createCallbackGateway } = await loadGateway();
    const gateway = createCallbackGateway({ paperclipWebhookUrl: `${paperclipBase}/webhook` });
    const base = await listen(gateway);
    const event = { type: "message_new", group_id: 123, secret: "test-secret", event_id: "evt-1" };

    const response = await fetch(`${base}/callback/123?confirmation=confirm-123&secret=test-secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(forwardedBody).toEqual(event);
  });

  it("отклоняет неверное сообщество и секрет", async () => {
    const { createCallbackGateway } = await loadGateway();
    const gateway = createCallbackGateway({ paperclipWebhookUrl: "http://127.0.0.1:1/webhook" });
    const base = await listen(gateway);

    const wrongGroup = await fetch(`${base}/callback/123?confirmation=code&secret=right`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "confirmation", group_id: 456, secret: "right" }),
    });
    expect(wrongGroup.status).toBe(403);

    const wrongSecret = await fetch(`${base}/callback/123?confirmation=code&secret=right`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "confirmation", group_id: 123, secret: "wrong" }),
    });
    expect(wrongSecret.status).toBe(403);
  });

  it("показывает безопасный статус последнего запроса", async () => {
    const { createCallbackGateway } = await loadGateway();
    const gateway = createCallbackGateway({ paperclipWebhookUrl: "http://127.0.0.1:1/webhook" });
    const base = await listen(gateway);

    await fetch(`${base}/callback/123?confirmation=confirm-secret&secret=callback-secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "confirmation",
        group_id: 123,
        secret: "callback-secret",
        object: { message: { text: "личное сообщение" } },
      }),
    });

    const status = await (await fetch(`${base}/status/123`)).json() as Record<string, unknown>;
    expect(status).toMatchObject({
      groupId: 123,
      eventType: "confirmation",
      confirmed: true,
      forwarded: false,
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("callback-secret");
    expect(serialized).not.toContain("confirm-secret");
    expect(serialized).not.toContain("личное сообщение");
  });
});
