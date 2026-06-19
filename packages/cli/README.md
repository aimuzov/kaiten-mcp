# kaiten-mcp

**English** · [Русский](README.ru.md)

[![npm version](https://img.shields.io/npm/v/kaiten-mcp)](https://www.npmjs.com/package/kaiten-mcp)
[![license](https://img.shields.io/npm/l/kaiten-mcp)](LICENSE)

MCP server for [Kaiten](https://kaiten.ru) over stdio — for local use in Cowork, Claude
Code, Claude Desktop and other MCP clients.

Provides 36 `kaiten_*` tools: cards, spaces, boards, comments, checklists, time tracking,
day planning.

Full documentation — in the [root README](https://github.com/aimuzov/kaiten-mcp#readme).

## Quick start

```bash
# Install
npm install -g kaiten-mcp

# Run (the MCP client launches this itself)
kaiten-mcp
```

## Configuration

Copy `.env.example` to `.env` and fill it in, or pass the variables through your MCP
client config:

| Variable                         | Required | Purpose                                                          |
| -------------------------------- | -------- | ---------------------------------------------------------------- |
| `KAITEN_API_URL`                 | no\*     | Kaiten API base, e.g. `https://your-domain.kaiten.ru/api/latest` |
| `KAITEN_API_TOKEN`               | no\*     | Personal API token                                               |
| `KAITEN_DEFAULT_SPACE_ID`        | no       | Default space                                                    |
| `KAITEN_REQUEST_TIMEOUT_MS`      | no       | Request timeout, ms (default 30000)                              |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | no       | Max concurrent requests 1–20 (default 5)                         |
| `KAITEN_LOG_LEVEL`               | no       | `error` / `warn` / `info` / `debug` (default `info`)             |
| `KAITEN_LOG_FILE`                | no       | Log file path                                                    |

`*` If unset, the server requests them via MCP elicitation on the first call.

## Connecting in Claude Desktop / Cowork

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "kaiten-mcp",
      "env": {
        "KAITEN_API_URL": "https://your-domain.kaiten.ru/api/latest",
        "KAITEN_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Connecting in Claude Code

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  --env KAITEN_API_TOKEN=your-token \
  -- kaiten-mcp
```

## License

MIT
