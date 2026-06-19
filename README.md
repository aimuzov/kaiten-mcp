# kaiten-mcp

**English** · [Русский](README.ru.md)

[![npm version](https://img.shields.io/npm/v/kaiten-mcp)](https://www.npmjs.com/package/kaiten-mcp)
[![license](https://img.shields.io/npm/l/kaiten-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/kaiten-mcp)](https://nodejs.org)

MCP server for full control over [Kaiten](https://kaiten.ru) from any MCP client.
Provides 36 `kaiten_*` tools: spaces, boards, cards, comments, checklists, time
tracking, tags, members, flexible queries and day planning.

## Two ways to use it

### (a) Local stdio server via npm

Installed as an npm package and launched locally by an MCP client. The token is kept
in environment variables or requested interactively (elicitation).

Good for: Cowork, Claude Code, Claude Desktop (local).

### (b) Remote server on Vercel

The Next.js app in `apps/web` is deployed to Vercel and becomes a remote MCP server with
OAuth 2.1 + PKCE. Each teammate connects by URL in Claude Desktop and enters their own
Kaiten API token — no handing tokens around through configs.

Good for: team usage, Claude Desktop (remote connector).

---

## Local stdio server

### Features

36 `kaiten_*` tools:

| Group               | Tools                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Users               | `get_current_user`, `list_users`                                                                           |
| Spaces / boards     | `list_spaces`, `get_space`, `list_boards`, `get_board`                                                     |
| Reference data      | `list_columns`, `list_lanes`, `list_card_types`, `list_tags`                                               |
| Cards               | `get_card`, `create_card`, `update_card`, `move_card`, `delete_card`, `archive_card`                       |
| Card members / tags | `add_card_member`, `remove_card_member`, `add_card_tag`, `remove_card_tag`                                 |
| Queries             | `search_cards` (filters: board, column, owner, tags, due dates, text, + arbitrary params)                  |
| Comments            | `list_comments`, `create_comment`, `update_comment`, `delete_comment`                                      |
| Checklists          | `list_checklists`, `add_checklist`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item` |
| Time tracking       | `list_time_logs`, `add_time_log`, `delete_time_log`                                                        |
| Planning            | `today_tasks`, `overdue_cards`, `plan_day`                                                                 |

#### Planning tools

- **`kaiten_today_tasks`** — the user's active cards due today or earlier, sorted by priority and due date.
- **`kaiten_overdue_cards`** — overdue cards only.
- **`kaiten_plan_day`** — a ready-made day plan: grouped into "Overdue / Today" plus markdown text and a structured list.

If `user_id` is omitted, the token's current user is used.

### Requirements

- Node.js >= 20 (22 LTS recommended, pinned in `mise.toml`).
- A personal Kaiten API token.

### Installation

```bash
# From npm:
npm install -g kaiten-mcp

# Or run on demand without installing:
npx kaiten-mcp

# From source:
git clone https://github.com/aimuzov/kaiten-mcp.git
cd kaiten-mcp
npm install
npm run build
```

### Configuration

Copy `packages/cli/.env.example` to `packages/cli/.env` and fill it in (or pass the
variables through your MCP client config):

| Variable                         | Required | Purpose                                                                                 |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `KAITEN_API_URL`                 | yes\*    | API base, e.g. `https://your-domain.kaiten.ru/api/latest` (`/api/latest` is auto-added) |
| `KAITEN_API_TOKEN`               | yes\*    | Personal API token                                                                      |
| `KAITEN_DEFAULT_SPACE_ID`        | no       | Default space for `list_boards` without a `space_id`                                    |
| `KAITEN_REQUEST_TIMEOUT_MS`      | no       | Request timeout, ms (default 30000)                                                     |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | no       | Max concurrent requests 1–20 (default 5)                                                |
| `KAITEN_LOG_LEVEL`               | no       | `error` / `warn` / `info` / `debug` (default `info`)                                    |
| `KAITEN_LOG_FILE`                | no       | Log file path (otherwise stderr only)                                                   |

> Where to get a token: in Kaiten, open your profile → the API keys section and create a token.

### Interactive token request (elicitation)

`*` — `KAITEN_API_URL` and `KAITEN_API_TOKEN` are **not required at startup**. If they are
not set, the server will ask you for them **right inside the client** on the first call to
Kaiten — via the standard MCP **elicitation** mechanism. The entered values are kept only
in process memory for the duration of the session and are never written to disk.

- Works only if the client supports elicitation (declares the `elicitation` capability).
- If the client does not support elicitation and the variables are unset, any tool call returns a clear error asking you to set the variables.
- Want to always enter the token manually? Just leave `KAITEN_API_TOKEN` unset.

### Connecting in Cowork

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

The `env` block is optional — without it the server will ask for the token right inside
Cowork on the first Kaiten call (see [Interactive token request](#interactive-token-request-elicitation)).

### Connecting in Claude Code

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru/api/latest \
  --env KAITEN_API_TOKEN=your-token \
  -- kaiten-mcp
```

### Connecting in Claude Desktop (local)

In `claude_desktop_config.json` add the same `mcpServers` block as for Cowork above.

### Tests (stdio)

```bash
npm run build
npm run smoke -w kaiten-mcp        # initialize + tools/list (no credentials)
npm run test:elicit -w kaiten-mcp  # interactive token request check
npm run test -w @kaiten-mcp/core   # core unit tests (vitest)
```

---

## Remote server on Vercel

The `apps/web` app is a Next.js server with a full OAuth 2.1 + PKCE flow that deploys to
Vercel. Teammates connect it in Claude Desktop by URL rather than through configs with
tokens.

**Important:** Claude Desktop supports only OAuth authentication for remote connectors —
you cannot pass a token via a header or URL parameter. That is why a full OAuth flow is
implemented here.

### How it works

1. An administrator deploys `apps/web` to Vercel.
2. A teammate in Claude Desktop: Settings → Connectors → Add custom connector → enters the deployment URL.
3. Claude Desktop starts OAuth: the browser opens, a form is shown — the teammate enters their personal Kaiten API token.
4. The token is encrypted via JWE (`AUTH_SECRET`) and returned to Claude Desktop as a Bearer token.
5. On every MCP request the server decrypts the token and talks to Kaiten on behalf of that specific teammate.
6. No database is needed — the architecture is fully stateless.

### Environment variables

| Variable         | Required | Purpose                                                                                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`    | **yes**  | OAuth token encryption key. At least 16 chars, 32+ recommended. The teammate's token is stored encrypted — without this key authorization is impossible. |
| `KAITEN_API_URL` | no       | A single Kaiten URL for the whole organization. If set, the form does not ask the teammate for a URL.                                                    |

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in for local development.

### Deploy to Vercel

**Recommended — Root Directory in the dashboard:**

1. Import the repository into Vercel.
2. In project settings set **Root Directory = `apps/web`**.
3. Vercel auto-detects Next.js and configures everything.
4. In Environment Variables add `AUTH_SECRET` (required) and optionally `KAITEN_API_URL`.

**Alternative — `vercel.json` in the root:**

The repository root already contains a `vercel.json` that tells Vercel to build `apps/web`
from the monorepo root. Just import the repository without changing the Root Directory.

### Connecting a teammate in Claude Desktop

Settings → Connectors → Add custom connector → enter the deployment URL (e.g.
`https://kaiten-mcp.vercel.app`). Claude Desktop starts the OAuth flow: a form opens where
the teammate enters their Kaiten API token. After that all `kaiten_*` tools become
available.

---

## Monorepo architecture

```
kaiten-mcp/
├── package.json                      # npm workspaces
├── packages/
│   ├── core/  (@kaiten-mcp/core)     # Shared core: Kaiten client, 36 tools,
│   │                                 # JWE tokens, PKCE verification, types
│   └── cli/   (kaiten-mcp)           # stdio MCP server (npm package, bin)
└── apps/
    └── web/   (@kaiten-mcp/web)      # Next.js remote server on Vercel,
                                      # OAuth 2.1 + PKCE + MCP endpoint
```

### Packages

- **`@kaiten-mcp/core`** — shared logic: Kaiten API client, all 36 tools, JWE seal/open
  (for OAuth tokens), PKCE S256 verification, entity types. Tests: vitest.
- **`kaiten-mcp`** (`packages/cli`) — the published npm package, a stdin/stdout MCP server.
  Uses `@kaiten-mcp/core`. Tests: smoke + elicitation.
- **`@kaiten-mcp/web`** (`apps/web`) — Next.js app: OAuth 2.1 (PKCE + DCR), MCP endpoint
  via `mcp-handler`. Test: `npm run test:flow`.

## Kaiten API notes

- Base path is `/api/latest`, authentication is `Authorization: Bearer <token>`.
- Column type: `1` — queue, `2` — in progress, `3` — done.
- Card `condition`: `1` — active, `2` — archived.
- In `search_cards`, rare Kaiten parameters can be passed via `extra_params`.

## License

MIT
