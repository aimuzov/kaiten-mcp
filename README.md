# kaiten-mcp

**English** · [Русский](README.ru.md)

[![check](https://img.shields.io/github/actions/workflow/status/aimuzov/kaiten-mcp/check.yml?branch=main&label=check)](https://github.com/aimuzov/kaiten-mcp/actions/workflows/check.yml)
[![npm](https://img.shields.io/npm/v/@aimuzov/kaiten-mcp)](https://www.npmjs.com/package/@aimuzov/kaiten-mcp)
[![license](https://img.shields.io/github/license/aimuzov/kaiten-mcp)](LICENSE)

MCP server for [Kaiten](https://kaiten.ru): 40 `kaiten_*` tools for spaces, boards, cards, comments, checklists, time
tracking, tags, members, card search and day planning. It runs locally over stdio or as a hosted connector where
everyone signs in with their own Kaiten API token. Built on [infra-mcp-kit](https://github.com/aimuzov/infra-mcp-kit).

## Tools

| Group               | Tools                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Users               | `get_current_user`, `list_users`                                                                               |
| Spaces / boards     | `list_spaces`, `get_space`, `list_boards`, `get_board`                                                         |
| Reference data      | `list_columns`, `list_lanes`, `list_card_types`, `list_tags`                                                   |
| Cards               | `get_card`, `create_card`, `update_card`, `move_card`, `delete_card`, `archive_card`                           |
| Card members / tags | `add_card_member`, `remove_card_member`, `add_card_tag`, `remove_card_tag`                                     |
| External links      | `list_card_external_links`, `add_card_external_link`, `update_card_external_link`, `remove_card_external_link` |
| Search              | `search_cards` (board, column, owner, tags, due dates, text and any extra Kaiten parameters)                   |
| Comments            | `list_comments`, `create_comment`, `update_comment`, `delete_comment`                                          |
| Checklists          | `list_checklists`, `add_checklist`, `add_checklist_item`, `update_checklist_item`, `delete_checklist_item`     |
| Time tracking       | `list_time_logs`, `add_time_log`, `delete_time_log`                                                            |
| Planning            | `today_tasks`, `overdue_cards`, `plan_day`                                                                     |

The planning tools take the token's own user when `user_id` is omitted.

## Local server

Node 26 or newer and a personal Kaiten API token (profile → API keys).

```bash
claude mcp add kaiten \
  --env KAITEN_API_URL=https://your-domain.kaiten.ru \
  --env KAITEN_API_TOKEN=your-token \
  -- npx -y @aimuzov/kaiten-mcp
```

Claude Desktop and Cowork take the same block as [.mcp.json.example](.mcp.json.example). Both variables are optional:
without them the server asks for the address and the token through MCP elicitation on the first Kaiten call and keeps
them in memory only.

| Variable                         | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `KAITEN_API_URL`                 | Kaiten address, `/api/latest` is added when missing |
| `KAITEN_API_TOKEN`               | Personal API token                                  |
| `KAITEN_DEFAULT_SPACE_ID`        | Default space for `list_boards`                     |
| `KAITEN_REQUEST_TIMEOUT_MS`      | Request timeout, 30000 by default                   |
| `KAITEN_MAX_CONCURRENT_REQUESTS` | Concurrent requests per token, 1–20, 5 by default   |
| `KAITEN_LOG_LEVEL`               | `error`, `warn`, `info` (default) or `debug`        |
| `KAITEN_LOG_FILE`                | Log file on top of stderr                           |

## Hosted connector

`kaiten-mcp serve --http` is a remote MCP connector with OAuth 2.1, PKCE and dynamic client registration. In Claude:
Settings → Connectors → Add custom connector → `https://kaiten-mcp.aimuzov.online/mcp`. The browser opens a sign-in form
where you paste your Kaiten API token; the server checks it against Kaiten and puts it into encrypted access tokens.
Kaiten tokens are never stored on the server: only registered OAuth clients live in `auth.db`.

It runs on the projects server in Docker behind the shared Caddy, see [deploy/](deploy) and
[.env.example](.env.example). On top of the variables above it needs `PUBLIC_URL`, `AUTH_SECRET` (32+ characters)
and optionally `PORT` and `ALLOWED_REDIRECT_URIS`. With `KAITEN_API_URL` set, the form doesn't ask for the address.

## Development

```bash
npm ci
npm test          # node --test, includes the OAuth flow against a fake Kaiten
npm run typecheck
npm run lint
npm start         # stdio server straight from the TypeScript sources
```

## Kaiten API notes

- Base path `/api/latest`, `Authorization: Bearer <token>`.
- Column type: `1` queue, `2` in progress, `3` done. Card `condition`: `1` active, `2` archived.
- Rare `search_cards` parameters go through `extra_params`.

## License

MIT
