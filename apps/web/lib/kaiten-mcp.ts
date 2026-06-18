import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  KaitenClient,
  Logger,
  CredentialsProvider,
  makeToolContext,
  registerAllTools,
  openToken,
  loadConfig,
  normalizeApiUrl,
} from "@kaiten-mcp/core";
import { getAuthSecret } from "./baseUrl";

const baseConfig = loadConfig();
const logger = new Logger({ level: baseConfig.logLevel });

// Маленький кэш клиентов на инстанс (переиспользование между прогревами).
const clientCache = new Map<string, KaitenClient>();

function clientForAuth(authInfo: AuthInfo | undefined): KaitenClient {
  const kaitenToken = authInfo?.extra?.kaitenToken as string | undefined;
  const rawUrl = (authInfo?.extra?.kaitenUrl as string | undefined) ?? baseConfig.apiUrl;
  if (!kaitenToken) throw new Error("Нет учётных данных Kaiten в токене доступа");
  if (!rawUrl) throw new Error("Не задан Kaiten URL (ни в токене, ни в KAITEN_API_URL)");
  // URL из формы может прийти без /api/latest — нормализуем (идемпотентно).
  const kaitenUrl = normalizeApiUrl(rawUrl);
  const cacheKey = `${kaitenUrl}::${kaitenToken}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    const credentials = new CredentialsProvider({ apiUrl: kaitenUrl, apiToken: kaitenToken }, logger);
    client = new KaitenClient(baseConfig, credentials, logger);
    clientCache.set(cacheKey, client);
  }
  return client;
}

const baseHandler = createMcpHandler(
  (server) => {
    // Cast is needed because mcp-handler and @kaiten-mcp/core resolve the SDK
    // from different node_modules paths, producing nominally incompatible types
    // for private fields. The types are structurally identical at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeToolContext({
      server: server as never,
      logger,
      config: baseConfig,
      resolveClient: (extra) =>
        clientForAuth((extra as { authInfo?: AuthInfo } | undefined)?.authInfo),
    });
    registerAllTools(ctx);
  },
  { serverInfo: { name: "kaiten-mcp", version: "0.1.0" }, capabilities: { tools: {} } },
  { basePath: "/api", maxDuration: 60 },
);

const verifyToken = async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
  if (!bearer) return undefined;
  try {
    const payload = await openToken(bearer, getAuthSecret());
    if (payload.kind !== "access") return undefined;
    return {
      token: bearer,
      clientId: "kaiten-mcp",
      scopes: [],
      extra: { kaitenToken: payload.kaitenToken, kaitenUrl: payload.kaitenUrl },
    };
  } catch {
    return undefined;
  }
};

export const mcpHandler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});
