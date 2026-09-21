# Paperclip VK Community Tools

Интеграционный плагин Paperclip для управления сообществом ВКонтакте.

## Возможности

- 23 инструмента агента: сообщество, стена, медиа, комментарии, модерация, сообщения и статистика.
- Страница подключения в настройках компании (`companySettingsPage`).
- Виджет состояния сообщества на дашборде (`dashboardWidget`).
- Раздельные токены пользователя и сообщества через Paperclip Secret References.
- Ограничение запросов, повтор при VK Error 6, таймаут всего ответа и лимит размера тела.
- SSRF-защита и маскирование токенов в ошибках.

## Настройки

Плагин принимает только ссылки на секреты Paperclip:

- `groupId` — числовой ID сообщества без минуса;
- `userTokenRef` — пользовательский токен: публикации, медиа, статистика;
- `groupTokenRef` — токен сообщества: сообщения и модерация;
- `apiVersion` — версия VK API, по умолчанию `5.199`;
- `rateLimitRps` — запросов в секунду, по умолчанию `3`.

Открытые токены в конфигурации не поддерживаются.

## Инструменты

### Сообщество

- `vk_group_get_details`
- `vk_group_is_member`

### Стена

- `vk_wall_post`
- `vk_wall_edit`
- `vk_wall_delete`
- `vk_wall_get`
- `vk_wall_pin`
- `vk_wall_unpin`

### Медиа

- `vk_media_upload_photo`
- `vk_media_upload_document`
- `vk_media_upload_video`
- `vk_media_create_poll`

### Комментарии и модерация

- `vk_comments_get`
- `vk_comments_create`
- `vk_comments_delete`
- `vk_members_ban`
- `vk_members_unban`

### Сообщения

- `vk_messages_get_conversations`
- `vk_messages_get_history`
- `vk_messages_send`
- `vk_messages_mark_as_read`

### Статистика

- `vk_stats_get_summary`
- `vk_stats_get_post_reach`

## Важное ограничение текущего Paperclip SDK

`ctx.http.fetch` в `@paperclipai/plugin-sdk@2026.916.0` передаёт тело запроса worker→host как строку. Поэтому бинарный `multipart/form-data` для `vk_media_upload_photo` и `vk_media_upload_document` не может быть надёжно передан через host RPC без поддержки бинарного тела в SDK. Плагин не обходит host-аудит прямым глобальным `fetch` и не требует изменения ядра Paperclip. Видео (`video.save`) и опросы (`polls.create`) работают через обычный VK API.

## Проверка

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Сборка создаёт:

- `dist/manifest.js`
- `dist/worker.js`
- `dist/ui/index.js`

## Развёртывание

Скопируйте `package.json`, `pnpm-lock.yaml` и `dist/` в постоянный каталог Paperclip, например:

```text
/paperclip/plugins-local/zaruba.vk-community-tools
```

Установите через штатный Plugins API как локальный путь, затем задайте `groupId`, `userTokenRef` и `groupTokenRef` для компании.

## Безопасность

- Все внешние вызовы worker выполняет через `ctx.http.fetch`.
- Все секреты разрешаются через `ctx.secrets.resolve()` только во время вызова.
- URL для скачивания медиа должны быть публичными HTTPS URL.
- VK upload URL разрешены только на `*.vk.com`, `*.vk.ru`, `*.userapi.com`.
- Локальные, частные, link-local и metadata IP блокируются.

## Лицензия

MIT
