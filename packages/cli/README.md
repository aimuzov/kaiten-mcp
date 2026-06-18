# kaiten-mcp

MCP-сервер для управления [Kaiten](https://kaiten.ru) через stdio — для локального
использования в Cowork, Claude Code, Claude Desktop и других MCP-клиентах.

Предоставляет 36 инструментов `kaiten_*`: карточки, пространства, доски, комментарии,
чек-листы, учёт времени, планирование дня.

Полная документация — в [корневом README](https://github.com/aimuzov/kaiten-mcp#readme).

## Быстрый старт

```bash
# Установка
npm install -g kaiten-mcp

# Запуск (MCP-клиент вызывает это сам)
kaiten-mcp
```

## Конфигурация

Скопируйте `.env.example` в `.env` и заполните, или передайте переменные через конфиг
MCP-клиента:

| Переменная | Обязательна | Назначение |
| --- | --- | --- |
| `KAITEN_API_URL` | нет* | Базовый URL Kaiten, напр. `https://your-domain.kaiten.ru/api/latest` |
| `KAITEN_API_TOKEN` | нет* | Персональный API-токен |
| `KAITEN_DEFAULT_SPACE_ID` | нет | Пространство по умолчанию |
| `KAITEN_REQUEST_TIMEOUT_MS` | нет | Таймаут запросов, мс (по умолч. 30000) |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | нет | Лимит одновременных запросов 1–20 (по умолч. 5) |
| `KAITEN_LOG_LEVEL` | нет | `error` / `warn` / `info` / `debug` (по умолч. `info`) |
| `KAITEN_LOG_FILE` | нет | Путь к файлу лога |

`*` Если не заданы — сервер запросит их через MCP elicitation при первом обращении.

## Подключение в Claude Desktop / Cowork

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "kaiten-mcp",
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "ваш-токен"
      }
    }
  }
}
```

## Подключение в Claude Code

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  --env KAITEN_API_TOKEN=ваш-токен \
  -- kaiten-mcp
```

## Лицензия

MIT
