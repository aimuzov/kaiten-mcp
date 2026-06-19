# @kaiten-mcp/core

Shared core library for [kaiten-mcp](https://github.com/aimuzov/kaiten-mcp).

It is consumed by the [`kaiten-mcp`](https://www.npmjs.com/package/kaiten-mcp) CLI (a local
stdio MCP server) and by the remote Vercel server. You normally don't depend on this
package directly — install `kaiten-mcp` instead.

## What's inside

- Kaiten API client and the 36 `kaiten_*` MCP tools.
- JWE token seal/open and PKCE S256 verification (for the OAuth-based remote server).
- Shared entity types and configuration loading.

## Documentation

See the [root README](https://github.com/aimuzov/kaiten-mcp#readme).

## License

MIT
