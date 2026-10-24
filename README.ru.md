# kaiten-mcp

[English](README.md) · **Русский**

[![check](https://img.shields.io/github/actions/workflow/status/aimuzov/kaiten-mcp/check.yml?branch=main&label=check)](https://github.com/aimuzov/kaiten-mcp/actions/workflows/check.yml)
[![npm](https://img.shields.io/npm/v/@aimuzov/kaiten-mcp)](https://www.npmjs.com/package/@aimuzov/kaiten-mcp)
[![license](https://img.shields.io/github/license/aimuzov/kaiten-mcp)](LICENSE)

MCP-сервер для [Kaiten](https://kaiten.ru): 40 инструментов `kaiten_*` для пространств, досок, карточек, комментариев,
чек-листов, учёта времени, тегов, участников, поиска карточек и плана на день. Работает локально по stdio или удалённым
коннектором, куда каждый входит своим API-токеном Kaiten. Собран на [infra-mcp-kit](https://github.com/aimuzov/infra-mcp-kit).

## Инструменты

| Группа               | Инструменты                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Пользователи         | `get_current_user`, `list_users`                                                                               |
| Пространства и доски | `list_spaces`, `get_space`, `list_boards`, `get_board`                                                         |
| Справочники          | `list_columns`, `list_lanes`, `list_card_types`, `list_tags`                                                   |
| Карточки             | `get_card`, `create_card`, `update_card`, `move_card`, `delete_card`, `archive_card`                           |
| Участники и теги     | `add_card_member`, `remove_card_member`, `add_card_tag`, `remove_card_tag`                                     |
| Внешние ссылки       | `list_card_external_links`, `add_card_external_link`, `update_card_external_link`, `remove_card_external_link` |
| Поиск                | `search_cards` (доска, колонка, владелец, теги, сроки, текст и любые другие параметры Kaiten)                  |
| Комментарии          | `list_comments`, `create_comment`, `update_comment`, `delete_comment`                                          |
| Чек-листы            | `list_checklists`, `add_checklist`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item`     |
| Учёт времени         | `list_time_logs`, `add_time_log`, `delete_time_log`                                                            |
| Планирование         | `today_tasks`, `overdue_cards`, `plan_day`                                                                     |

Без `user_id` планировочные инструменты берут владельца токена.

## Локальный сервер

Нужны Node 26 и новее и личный API-токен Kaiten (профиль → API-ключи).

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru \
  --env KAITEN_API_TOKEN=your-token \
  -- npx -y @aimuzov/kaiten-mcp
```

Claude Desktop и Cowork подключаются тем же блоком, что в [.mcp.json.example](.mcp.json.example). Обе переменные
необязательны: без них сервер при первом обращении к Kaiten спросит адрес и токен через MCP elicitation и будет держать
их только в памяти.

| Переменная                       | Зачем                                                 |
| -------------------------------- | ----------------------------------------------------- |
| `KAITEN_API_URL`                 | Адрес Kaiten, `/api/latest` допишется сам             |
| `KAITEN_API_TOKEN`               | Личный API-токен                                      |
| `KAITEN_DEFAULT_SPACE_ID`        | Пространство по умолчанию для `list_boards`           |
| `KAITEN_REQUEST_TIMEOUT_MS`      | Тайм-аут запроса, по умолчанию 30000                  |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | Одновременных запросов на токен, 1–20, по умолчанию 5 |
| `KAITEN_LOG_LEVEL`               | `error`, `warn`, `info` (по умолчанию) или `debug`    |
| `KAITEN_LOG_FILE`                | Файл лога сверх stderr                                |

## Удалённый коннектор

`kaiten-mcp serve --http` -- удалённый MCP-коннектор с OAuth 2.1, PKCE и динамической регистрацией клиентов. В Claude:
Настройки → Коннекторы → Добавить свой → `https://kaiten-mcp.aimuzov.online/mcp`. В браузере откроется форма входа, куда
вставляешь API-токен Kaiten. Сервер проверяет его в Kaiten и кладёт в зашифрованные токены доступа. Токены Kaiten на
сервере не хранятся, в `auth.db` лежат только зарегистрированные OAuth-клиенты.

Коннектор живёт на сервере проектов в Docker за общим Caddy, см. [deploy/](deploy) и [.env.example](.env.example). Сверх
переменных выше ему нужны `PUBLIC_URL`, `AUTH_SECRET` (от 32 символов), по желанию `PORT` и `ALLOWED_REDIRECT_URIS`.
С заданным `KAITEN_API_URL` форма не спрашивает адрес.

## Разработка

```bash
npm ci
npm test          # node --test, включая OAuth-поток против фейкового Kaiten
npm run typecheck
npm run lint
npm start         # stdio-сервер прямо из TypeScript-исходников
```

## Заметки про Kaiten API

- Базовый путь `/api/latest`, `Authorization: Bearer <token>`.
- Тип колонки: `1` очередь, `2` в работе, `3` готово. `condition` карточки: `1` активна, `2` в архиве.
- Редкие параметры `search_cards` передаются через `extra_params`.

## Лицензия

MIT
