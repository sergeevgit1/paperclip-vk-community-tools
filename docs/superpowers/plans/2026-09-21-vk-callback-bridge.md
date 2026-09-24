# План реализации: VK Callback Gateway и русская локализация

> **Для исполнителя:** Используйте TDD: сначала падающие тесты, затем минимальный код. Все изменения должны быть проверяемыми.

**Цель:** Реализовать отдельный Callback-шлюз на Node.js для домена `vk.openser.ru`, добавить в интерфейс плагина генерацию ссылки и статус проверки, и перевести все пользовательские тексты и описания инструментов на русский язык.

**Стек:** Node.js (HTTP / ESM), React 19, TypeScript, Vitest, esbuild.

---

### Task 1: Сервис Callback-шлюза (`callback-gateway/`)

**Файлы:**
- Создать: `callback-gateway/server.mjs`
- Создать: `callback-gateway/Dockerfile`
- Создать: `callback-gateway/README.md`
- Тест: `tests/callback-gateway.spec.ts`

- [ ] **Шаг 1: Написать падающий тест для Callback-шлюза**
  Проверяет:
  - Возврат чистого текста `confirmation_code` на запрос `type: "confirmation"`.
  - Возврат `ok` при пересылке обычного события в mock webhook.
  - Проверку `group_id` и `secret`.
  - Эндпоинт `/status` для UI.

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**
  Run: `pnpm vitest run tests/callback-gateway.spec.ts`
  Expected: FAIL (файл шлюза отсутствует)

- [ ] **Шаг 3: Написать минимальный `callback-gateway/server.mjs`**
  Реализация на стандартной библиотеке Node.js без внешних npm-пакетов.

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**
  Run: `pnpm vitest run tests/callback-gateway.spec.ts`
  Expected: PASS

- [ ] **Шаг 5: Добавить Dockerfile и закоммитить**
  ```bash
  git add callback-gateway/ tests/callback-gateway.spec.ts
  git commit -m "feat(gateway): add standalone vk callback bridge service"
  ```

---

### Task 2: Русская локализация манифеста и инструментов (`src/manifest.ts`)

**Файлы:**
- Модифицировать: `src/manifest.ts`
- Тест: `tests/manifest-locale.spec.ts`

- [ ] **Шаг 1: Написать падающий тест на русскую локализацию инструментов**
  Проверяет, что `displayName` и `description` всех 23 инструментов на русском языке, а имена `name` начинаются с `vk_` и не изменились.

- [ ] **Шаг 2: Запустить тест и убедиться в падении**
  Run: `pnpm vitest run tests/manifest-locale.spec.ts`
  Expected: FAIL

- [ ] **Шаг 3: Перевести `src/manifest.ts` на русский язык**
  Перевести названия, описания инструментов и их параметров.

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**
  Run: `pnpm vitest run tests/manifest-locale.spec.ts`
  Expected: PASS

- [ ] **Шаг 5: Закоммитить**
  ```bash
  git add src/manifest.ts tests/manifest-locale.spec.ts
  git commit -m "feat(i18n): localize manifest tool names and descriptions to russian"
  ```

---

### Task 3: Обновление UI настроек и генерация ссылки Callback (`src/ui/`)

**Файлы:**
- Модифицировать: `src/ui/settings.tsx`
- Модифицировать: `src/ui/widget.tsx`
- Тест: `tests/ui-build.spec.ts`

- [ ] **Шаг 1: Добавить в настройки генерацию URL и блок статуса Callback**
  - Поле URL: `https://vk.openser.ru/callback/<groupId>?confirmation=<code>&secret=<secret>`
  - Кнопка «Скопировать»
  - Блок «Статус проверки Callback API» с отображением последнего входящего события.
  - Полная русификация всех подписей.

- [ ] **Шаг 2: Собрать UI и запустить тесты**
  Run: `pnpm run build:ui && pnpm vitest run tests/ui-build.spec.ts`
  Expected: PASS

- [ ] **Шаг 3: Закоммитить**
  ```bash
  git add src/ui/ tests/ui-build.spec.ts
  git commit -m "feat(ui): add callback url generator, status indicator and full russian ui"
  ```

---

### Task 4: Полная верификация, сборка и подготовка к production

**Файлы:**
- Затронутые артефакты: `dist/`

- [ ] **Шаг 1: Запустить typecheck**
  Run: `pnpm run typecheck`
  Expected: exit 0

- [ ] **Шаг 2: Запустить полный набор тестов**
  Run: `pnpm test`
  Expected: все тесты зеленые (100+ тестов)

- [ ] **Шаг 3: Выполнить production-сборку**
  Run: `pnpm run build`
  Expected: `dist/manifest.js`, `dist/worker.js`, `dist/ui/index.js` созданы без ошибок.

- [ ] **Шаг 4: Проверить статус ветки и подготовить коммит/PR**
  ```bash
  git status
  ```
