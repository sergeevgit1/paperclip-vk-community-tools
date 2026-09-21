# VK Callback Gateway

Небольшой HTTP-шлюз для Callback API ВКонтакте. Работает отдельным контейнером и не требует изменений ядра Paperclip.

## Назначение

ВКонтакте требует:

- при проверке сервера — чистую строку `confirmation_code`;
- при доставке события — чистую строку `ok`.

Штатный webhook-маршрут Paperclip отвечает JSON. Шлюз преобразует протокол VK и пересылает события в плагин.

## Переменные окружения

- `PORT` — порт сервиса, по умолчанию `3105`.
- `PAPERCLIP_WEBHOOK_URL` — внутренний webhook плагина. По умолчанию:
  `http://127.0.0.1:3100/api/plugins/zaruba.vk-community-tools/webhooks/vk-callback`.
- `MAX_BODY_BYTES` — максимальный размер JSON-тела, по умолчанию 1 МБ.

## Маршруты

- `POST /callback/:groupId?confirmation=<code>&secret=<secret>` — Callback API VK.
- `GET /status/:groupId` — безопасный статус последнего запроса для интерфейса.
- `GET /health` — проверка здоровья сервиса.

## Запуск

Обычный запуск:

```text
PORT=3105 PAPERCLIP_WEBHOOK_URL=http://company-server-1:3100/api/plugins/zaruba.vk-community-tools/webhooks/vk-callback node server.mjs
```

Docker:

```text
docker build -t vk-callback-gateway ./callback-gateway
docker run --rm -p 3105:3105 \
  -e PAPERCLIP_WEBHOOK_URL=http://company-server-1:3100/api/plugins/zaruba.vk-community-tools/webhooks/vk-callback \
  vk-callback-gateway
```

## Безопасность

- Токены доступа VK не используются и не передаются через URL.
- Callback-секрет сравнивается постоянным по времени способом.
- Статус не содержит payload, секрет или код подтверждения.
- Тело запроса ограничено по размеру.
