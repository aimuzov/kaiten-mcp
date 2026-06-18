# kaiten-mcp

MCP-сервер для полного управления [Kaiten](https://kaiten.ru) из любого MCP-клиента
(Cowork, Claude Code, Claude Desktop и т.д.). Позволяет работать с пространствами,
досками, карточками, комментариями, чек-листами, учётом времени, тегами и
участниками, делать гибкие выборки карточек и строить план дня из задач.

Написан на TypeScript поверх официального
[`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk),
транспорт — stdio.

## Возможности

36 инструментов `kaiten_*`:

| Группа | Инструменты |
| --- | --- |
| Пользователи | `get_current_user`, `list_users` |
| Пространства/доски | `list_spaces`, `get_space`, `list_boards`, `get_board` |
| Справочники | `list_columns`, `list_lanes`, `list_card_types`, `list_tags` |
| Карточки | `get_card`, `create_card`, `update_card`, `move_card`, `delete_card`, `archive_card` |
| Участники/теги карточки | `add_card_member`, `remove_card_member`, `add_card_tag`, `remove_card_tag` |
| Выборки | `search_cards` (фильтры: доска, колонка, ответственный, теги, сроки, текст, + произвольные параметры) |
| Комментарии | `list_comments`, `create_comment`, `update_comment`, `delete_comment` |
| Чек-листы | `list_checklists`, `add_checklist`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item` |
| Учёт времени | `list_time_logs`, `add_time_log`, `delete_time_log` |
| Планирование | `today_tasks`, `overdue_cards`, `plan_day` |

### Планировочные инструменты

- **`kaiten_today_tasks`** — активные карточки пользователя со сроком на сегодня или
  раньше (по умолчанию включая просроченные), отсортированные по приоритету и сроку.
- **`kaiten_overdue_cards`** — только просроченные карточки.
- **`kaiten_plan_day`** — готовый план дня: группировка «Просрочено / На сегодня» +
  markdown-текст плюс структурированный список.

Если `user_id` не указан — берётся текущий пользователь токена.

## Требования

- Node.js >= 20 (рекомендуется 22 LTS, версия закреплена в `mise.toml`).
- Персональный API-токен Kaiten.

## Установка

```bash
git clone <repo> kaiten-mcp
cd kaiten-mcp
npm install      # ставит зависимости и собирает проект (prepare -> build)
npm run build    # при необходимости пересобрать
```

## Конфигурация

Сервер читает настройки из переменных окружения. Скопируйте `.env.example` в `.env`
и заполните (или передайте переменные через конфиг MCP-клиента):

| Переменная | Обязательна | Назначение |
| --- | --- | --- |
| `KAITEN_API_URL` | да* | База API, напр. `https://your-domain.kaiten.ru/api/latest` (`/api/latest` добавится автоматически) |
| `KAITEN_API_TOKEN` | да* | Персональный API-токен |
| `KAITEN_DEFAULT_SPACE_ID` | нет | Пространство по умолчанию для `list_boards` без `space_id` |
| `KAITEN_REQUEST_TIMEOUT_MS` | нет | Таймаут запросов, мс (по умолч. 30000) |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | нет | Лимит одновременных запросов 1–20 (по умолч. 5) |
| `KAITEN_LOG_LEVEL` | нет | `error` / `warn` / `info` / `debug` (по умолч. `info`) |
| `KAITEN_LOG_FILE` | нет | Путь к файлу лога (иначе только stderr) |

> Где взять токен: в Kaiten откройте профиль → раздел с API-ключами и создайте токен.

### Интерактивный запрос токена (elicitation)

`*` — `KAITEN_API_URL` и `KAITEN_API_TOKEN` **не обязательны на старте**. Если они не
заданы, сервер запросит их у вас **в самом клиенте** при первом обращении к Kaiten —
через стандартный механизм MCP **elicitation**. Введённые значения хранятся только в
памяти процесса на время сессии и нигде не записываются на диск.

- Работает, только если клиент поддерживает elicitation (объявляет capability
  `elicitation`). Большинство актуальных MCP-клиентов поддерживают.
- Если клиент не поддерживает elicitation и переменные не заданы — при вызове любого
  инструмента вернётся понятная ошибка с просьбой задать `KAITEN_API_URL` и
  `KAITEN_API_TOKEN`.
- Хотите всегда вводить токен вручную (например, не хранить его в конфиге) — просто не
  указывайте `KAITEN_API_TOKEN` в `env`, и сервер спросит его при первом запросе.

## Запуск

```bash
npm start            # node dist/index.js (нужен собранный dist)
# или для разработки с автоперезапуском:
npm run dev
```

Сервер общается по stdio (JSON-RPC в stdout, логи — в stderr/файл), поэтому
запускается не «руками», а MCP-клиентом.

### Тесты

```bash
npm test            # build + smoke + проверка elicitation
npm run smoke       # initialize + tools/list (без кредов)
npm run test:elicit # проверка интерактивного запроса токена
```

- **smoke** — поднимает сервер подпроцессом, делает `initialize` + `tools/list` и
  проверяет, что все инструменты на месте. Реальный токен не нужен; сервер стартует
  даже без переменных окружения.
- **test:elicit** — клиент с поддержкой elicitation вызывает инструмент, которому
  нужны креды, и проверяет, что сервер действительно запрашивает `api_url`/`api_token`.

## Подключение в Cowork

В настройках Cowork добавьте кастомный MCP-сервер со следующей конфигурацией
(укажите абсолютный путь к собранному `dist/index.js`):

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/absolute/path/to/kaiten-mcp/dist/index.js"],
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "ваш-токен"
      }
    }
  }
}
```

Блок `env` можно и **не** указывать (или оставить только `KAITEN_API_URL`) — тогда при
первом обращении к Kaiten сервер сам спросит токен прямо в Cowork (см.
[Интерактивный запрос токена](#интерактивный-запрос-токена-elicitation)).

После подключения в Cowork станут доступны инструменты `kaiten_*` — можно просить,
например: «составь мой план на сегодня из Kaiten» или «покажи просроченные карточки и
перенеси их сроки».

## Подключение в Claude Code

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  --env KAITEN_API_TOKEN=ваш-токен \
  -- node /absolute/path/to/kaiten-mcp/dist/index.js
```

## Подключение в Claude Desktop

В `claude_desktop_config.json` добавьте тот же блок `mcpServers`, что и для Cowork выше.

## Архитектура

```
src/
├── index.ts            # точка входа: конфиг, креды, клиент, инструменты, stdio, elicitation
├── config.ts           # чтение env (креды опциональны), нормализация URL, редакция токена
├── credentials.ts      # хранение кредов + интерактивный запрос недостающих (elicitation)
├── logger.ts           # логирование в stderr/файл (stdout зарезервирован под JSON-RPC)
├── kaiten-client.ts    # клиент Kaiten REST API: ретраи (429/5xx), лимит конкурентности
├── types.ts            # лёгкие типы сущностей Kaiten
└── tools/              # инструменты по доменам + общий helper
    ├── helpers.ts      # ToolContext, run(), форматирование результатов
    ├── users.ts  spaces-boards.ts  lookups.ts
    ├── cards.ts  card-extras.ts  search.ts
    ├── comments.ts  checklists.ts  time-logs.ts
    └── planning.ts
scripts/
├── smoke.ts            # stdio smoke-тест через официальный MCP-клиент
└── elicit-test.ts      # проверка интерактивного запроса кредов (elicitation)
```

## Заметки по Kaiten API

- Базовый путь — `/api/latest`, аутентификация — `Authorization: Bearer <token>`.
- Тип колонки: `1` — очередь, `2` — в работе, `3` — готово (используется при
  планировании, чтобы исключать выполненные карточки).
- Состояние карточки `condition`: `1` — активная, `2` — архив.
- В `search_cards` редкие/новые параметры Kaiten можно передавать через `extra_params`,
  не дожидаясь явной поддержки в схеме.

## Лицензия

MIT
