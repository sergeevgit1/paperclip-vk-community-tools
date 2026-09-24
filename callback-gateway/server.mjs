import http from "node:http";
import crypto from "node:crypto";

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export function createCallbackGateway(options = {}) {
  const paperclipWebhookUrl =
    options.paperclipWebhookUrl ||
    process.env.PAPERCLIP_WEBHOOK_URL ||
    "http://127.0.0.1:3100/api/plugins/zaruba.vk-community-tools/webhooks/vk-callback";
  const maxBodyBytes = options.maxBodyBytes || Number(process.env.MAX_BODY_BYTES) || DEFAULT_MAX_BODY_BYTES;

  // Recent status memory per groupId: { groupId, eventType, timestamp, confirmed, forwarded, status, error }
  const recentStatuses = new Map();

  function safeCompare(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      // 1. Health check
      if (req.method === "GET" && pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "vk-callback-gateway" }));
        return;
      }

      // 2. Safe status query for UI
      const statusMatch = pathname.match(/^\/status\/(\d+)$/);
      if (req.method === "GET" && statusMatch) {
        const groupId = Number(statusMatch[1]);
        const record = recentStatuses.get(groupId);
        res.writeHead(200, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        res.end(JSON.stringify(record || { groupId, hasEvents: false }));
        return;
      }

      // 3. Callback endpoint: POST /callback/:groupId
      const callbackMatch = pathname.match(/^\/callback\/(\d+)$/);
      if (req.method === "POST" && callbackMatch) {
        const expectedGroupId = Number(callbackMatch[1]);
        const confirmationCode = (url.searchParams.get("confirmation") || "").trim();
        const expectedSecret = (url.searchParams.get("secret") || "").trim();

        // Read body bounded
        const chunks = [];
        let totalBytes = 0;

        for await (const chunk of req) {
          totalBytes += chunk.length;
          if (totalBytes > maxBodyBytes) {
            res.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
            res.end("Слишком большой объем данных");
            return;
          }
          chunks.push(chunk);
        }

        const rawBody = Buffer.concat(chunks).toString("utf8");
        let payload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("Ожидается корректный JSON");
          return;
        }

        const receivedGroupId = Number(payload?.group_id);
        if (receivedGroupId !== expectedGroupId) {
          res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
          res.end("Несовпадение идентификатора сообщества");
          return;
        }

        if (expectedSecret.length > 0) {
          const receivedSecret = typeof payload?.secret === "string" ? payload.secret : "";
          if (!safeCompare(receivedSecret, expectedSecret)) {
            res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
            res.end("Неверный секретный ключ");
            return;
          }
        }

        const eventType = typeof payload?.type === "string" ? payload.type : "unknown";

        // Case A: VK Confirmation Handshake
        if (eventType === "confirmation") {
          recentStatuses.set(expectedGroupId, {
            groupId: expectedGroupId,
            eventType: "confirmation",
            timestamp: new Date().toISOString(),
            confirmed: true,
            forwarded: false,
            status: "success",
          });

          res.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "x-vk-gateway": "confirmed",
          });
          res.end(confirmationCode);
          return;
        }

        // Case B: Regular event - forward to Paperclip webhook
        let forwardOk = false;
        let forwardError = null;

        try {
          const fwdRes = await fetch(paperclipWebhookUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "VK-Callback-Gateway/1.0",
            },
            body: rawBody,
          });

          if (fwdRes.ok) {
            forwardOk = true;
          } else {
            forwardError = `Paperclip webhook вернул статус ${fwdRes.status}`;
          }
        } catch (err) {
          forwardError = err instanceof Error ? err.message : String(err);
        }

        recentStatuses.set(expectedGroupId, {
          groupId: expectedGroupId,
          eventType,
          timestamp: new Date().toISOString(),
          confirmed: false,
          forwarded: forwardOk,
          status: forwardOk ? "success" : "forward_error",
          error: forwardError,
        });

        if (forwardOk) {
          res.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "x-vk-gateway": "forwarded",
          });
          res.end("ok");
        } else {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          res.end("Ошибка доставки в Paperclip");
        }
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Маршрут не найден");
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Внутренняя ошибка сервера");
    }
  });

  return server;
}

// Standalone CLI launch
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const port = Number(process.env.PORT) || 3105;
  const server = createCallbackGateway();
  server.listen(port, "0.0.0.0", () => {
    console.log(`VK Callback Gateway запущен на порту ${port}`);
  });
}
