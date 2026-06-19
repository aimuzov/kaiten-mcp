# kaiten-mcp

[English](README.md) · **Русский**

MCP-сервер для полного управления [Kaiten](https://kaiten.ru) из любого MCP-клиента.
Предоставляет 36 инструментов `kaiten_*`: пространства, доски, карточки, комментарии,
чек-листы, учёт времени, теги, участники, гибкие выборки, планирование дня.

## Два способа использования

### (а) Локальный stdio-сервер через npm

Устанавливается как npm-пакет и запускается MCP-клиентом локально. Токен хранится в
переменных окружения или запрашивается интерактивно (elicitation).

Подходит для: Cowork, Claude Code, Claude Desktop (локальный).

### (б) Удалённый сервер на Vercel

Next.js-приложение из `apps/web` разворачивается на Vercel и становится удалённым
MCP-сервером с OAuth 2.1 + PKCE. Каждый сотрудник подключается по URL в Claude Desktop
и вводит свой Kaiten API-токен — без раздачи токенов через конфиги.

Подходит для: командного использования, Claude Desktop (удалённый connector).

---

## Локальный stdio-сервер

### Возможности

36 инструментов `kaiten_*`:

| Группа                  | Инструменты                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Пользователи            | `get_current_user`, `list_users`                                                                           |
| Пространства/доски      | `list_spaces`, `get_space`, `list_boards`, `get_board`                                                     |
| Справочники             | `list_columns`, `list_lanes`, `list_card_types`, `list_tags`                                               |
| Карточки                | `get_card`, `create_card`, `update_card`, `move_card`, `delete_card`, `archive_card`                       |
| Участники/теги карточки | `add_card_member`, `remove_card_member`, `add_card_tag`, `remove_card_tag`                                 |
| Выборки                 | `search_cards` (фильтры: доска, колонка, ответственный, теги, сроки, текст, + произвольные параметры)      |
| Комментарии             | `list_comments`, `create_comment`, `update_comment`, `delete_comment`                                      |
| Чек-листы               | `list_checklists`, `add_checklist`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item` |
| Учёт времени            | `list_time_logs`, `add_time_log`, `delete_time_log`                                                        |
| Планирование            | `today_tasks`, `overdue_cards`, `plan_day`                                                                 |

#### Планировочные инструменты

- **`kaiten_today_tasks`** — активные карточки пользователя со сроком на сегодня или раньше, отсортированные по приоритету и сроку.
- **`kaiten_overdue_cards`** — только просроченные карточки.
- **`kaiten_plan_day`** — готовый план дня: группировка «Просрочено / На сегодня» + markdown-текст и структурированный список.

Если `user_id` не указан — берётся текущий пользователь токена.

### Требования

- Node.js >= 20 (рекомендуется 22 LTS, версия закреплена в `mise.toml`).
- Персональный API-токен Kaiten.

### Установка

```bash
# Из npm (после публикации):
npm install -g kaiten-mcp

# Из исходников:
git clone <repo> kaiten-mcp
cd kaiten-mcp
npm install
npm run build
```

### Конфигурация

Скопируйте `packages/cli/.env.example` в `packages/cli/.env` и заполните (или передайте
переменные через конфиг MCP-клиента):

| Переменная                       | Обязательна | Назначение                                                                                         |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `KAITEN_API_URL`                 | да\*        | База API, напр. `https://your-domain.kaiten.ru/api/latest` (`/api/latest` добавится автоматически) |
| `KAITEN_API_TOKEN`               | да\*        | Персональный API-токен                                                                             |
| `KAITEN_DEFAULT_SPACE_ID`        | нет         | Пространство по умолчанию для `list_boards` без `space_id`                                         |
| `KAITEN_REQUEST_TIMEOUT_MS`      | нет         | Таймаут запросов, мс (по умолч. 30000)                                                             |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | нет         | Лимит одновременных запросов 1–20 (по умолч. 5)                                                    |
| `KAITEN_LOG_LEVEL`               | нет         | `error` / `warn` / `info` / `debug` (по умолч. `info`)                                             |
| `KAITEN_LOG_FILE`                | нет         | Путь к файлу лога (иначе только stderr)                                                            |

> Где взять токен: в Kaiten откройте профиль → раздел с API-ключами и создайте токен.

### Интерактивный запрос токена (elicitation)

`*` — `KAITEN_API_URL` и `KAITEN_API_TOKEN` **не обязательны на старте**. Если они не
заданы, сервер запросит их у вас **в самом клиенте** при первом обращении к Kaiten —
через стандартный механизм MCP **elicitation**. Введённые значения хранятся только в
памяти процесса на время сессии и нигде не записываются на диск.

- Работает, только если клиент поддерживает elicitation (объявляет capability `elicitation`).
- Если клиент не поддерживает elicitation и переменные не заданы — при вызове любого инструмента вернётся понятная ошибка с просьбой задать переменные.
- Хотите всегда вводить токен вручную — просто не указывайте `KAITEN_API_TOKEN`.

### Подключение в Cowork

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/absolute/path/to/kaiten-mcp/packages/cli/dist/index.js"],
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "ваш-токен"
      }
    }
  }
}
```

Блок `env` можно и не указывать — тогда при первом обращении к Kaiten сервер сам спросит
токен прямо в Cowork (см. [Интерактивный запрос токена](#интерактивный-запрос-токена-elicitation)).

### Подключение в Claude Code

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  --env KAITEN_API_TOKEN=ваш-токен \
  -- node /absolute/path/to/kaiten-mcp/packages/cli/dist/index.js
```

### Подключение в Claude Desktop (локально)

В `claude_desktop_config.json` добавьте тот же блок `mcpServers`, что и для Cowork выше.

### Тесты (stdio)

```bash
npm run build
npm run smoke -w kaiten-mcp      # initialize + tools/list (без кредов)
npm run test:elicit -w kaiten-mcp # проверка интерактивного запроса токена
npm run test -w @kaiten-mcp/core  # unit-тесты ядра (vitest)
```

---

## Удалённый сервер на Vercel

Приложение `apps/web` — это Next.js-сервер с полным OAuth 2.1 + PKCE флоу, который
разворачивается на Vercel. Сотрудники подключают его в Claude Desktop по URL, а не через
конфиги с токенами.

**Важно:** Claude Desktop поддерживает только OAuth-аутентификацию для удалённых
connector-ов — передать токен через заголовок или URL-параметр нельзя. Именно поэтому
здесь реализован полный OAuth-флоу.

### Как это работает

1. Администратор деплоит `apps/web` на Vercel.
2. Сотрудник в Claude Desktop: Settings → Connectors → Add custom connector → вводит URL деплоя.
3. Claude Desktop запускает OAuth: открывает браузер, отображается форма — сотрудник вводит свой персональный Kaiten API-токен.
4. Токен шифруется через JWE (`AUTH_SECRET`) и возвращается Claude Desktop как Bearer-токен.
5. На каждый MCP-запрос сервер расшифровывает токен и обращается к Kaiten от имени конкретного сотрудника.
6. База данных не нужна — архитектура полностью stateless.

### Переменные окружения

| Переменная       | Обязательна | Назначение                                                                                                                                                      |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`    | **да**      | Ключ шифрования OAuth-токенов. Минимум 16 символов, рекомендуется 32+. Токен сотрудника хранится в зашифрованном виде — без этого ключа авторизация невозможна. |
| `KAITEN_API_URL` | нет         | Единый Kaiten URL для всей организации. Если задан, форма не спрашивает URL у сотрудника.                                                                       |

Скопируйте `apps/web/.env.example` в `apps/web/.env.local` и заполните для локальной разработки.

### Деплой на Vercel

**Рекомендуемый способ — Root Directory в дашборде:**

1. Импортируйте репозиторий в Vercel.
2. В настройках проекта установите **Root Directory = `apps/web`**.
3. Vercel автоматически определит Next.js и всё настроит.
4. В разделе Environment Variables добавьте `AUTH_SECRET` (обязательно) и опционально `KAITEN_API_URL`.

**Альтернативный способ — `vercel.json` в корне:**

В корне репозитория уже есть `vercel.json`, который указывает Vercel собирать `apps/web`
из корня монорепо. Просто импортируйте репозиторий без изменения Root Directory.

### Подключение сотрудника в Claude Desktop

Settings → Connectors → Add custom connector → введите URL деплоя (например,
`https://kaiten-mcp.vercel.app`). Claude Desktop запустит OAuth-флоу: откроется форма,
где сотрудник вводит свой Kaiten API-токен. После этого все инструменты `kaiten_*`
становятся доступны.

---

## Архитектура монорепо

```
kaiten-mcp/
├── package.json                      # npm workspaces
├── packages/
│   ├── core/  (@kaiten-mcp/core)     # Общее ядро: клиент Kaiten, 36 инструментов,
│   │                                 # JWE-токены, проверка PKCE, типы
│   └── cli/   (kaiten-mcp)           # stdio MCP-сервер (npm-пакет, bin)
└── apps/
    └── web/   (@kaiten-mcp/web)      # Next.js удалённый сервер на Vercel,
                                      # OAuth 2.1 + PKCE + MCP-эндпоинт
```

### Пакеты

- **`@kaiten-mcp/core`** — общая логика: клиент Kaiten API, все 36 инструментов,
  JWE seal/open (для OAuth-токенов), проверка PKCE S256, типы сущностей. Тесты: vitest.
- **`kaiten-mcp`** (`packages/cli`) — публикуемый npm-пакет, stdin/stdout MCP-сервер.
  Использует `@kaiten-mcp/core`. Тесты: smoke + elicitation.
- **`@kaiten-mcp/web`** (`apps/web`) — Next.js-приложение: OAuth 2.1 (PKCE + DCR),
  MCP-эндпоинт через `mcp-handler`. Тест: `npm run test:flow`.

## Заметки по Kaiten API

- Базовый путь — `/api/latest`, аутентификация — `Authorization: Bearer <token>`.
- Тип колонки: `1` — очередь, `2` — в работе, `3` — готово.
- Состояние карточки `condition`: `1` — активная, `2` — архив.
- В `search_cards` редкие параметры Kaiten можно передавать через `extra_params`.

## Лицензия

MIT
