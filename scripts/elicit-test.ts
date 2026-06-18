/**
 * Интеграционный тест интерактивного запроса учётных данных (elicitation).
 *
 * Поднимает сервер БЕЗ кредов в окружении, подключается клиентом с поддержкой
 * elicitation и вызывает инструмент, которому нужны креды. Проверяет, что сервер
 * прислал запрос на ввод api_url и api_token. Сам HTTP-запрос к Kaiten ожидаемо
 * не проходит (хост ненастоящий) — нас интересует факт запроса кредов.
 *
 * Запуск: npm run build && npm run test:elicit
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: {
      ...(process.env as Record<string, string>),
      KAITEN_LOG_LEVEL: "error",
      KAITEN_REQUEST_TIMEOUT_MS: "3000",
    },
  });

  const client = new Client(
    { name: "kaiten-mcp-elicit-test", version: "0.0.0" },
    { capabilities: { elicitation: {} } }
  );

  let elicitCalled = false;
  let askedForUrl = false;
  let askedForToken = false;
  let promptMessage = "";

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    elicitCalled = true;
    promptMessage = request.params.message ?? "";
    const props =
      "requestedSchema" in request.params
        ? (request.params.requestedSchema?.properties ?? {})
        : {};
    askedForUrl = "api_url" in props;
    askedForToken = "api_token" in props;
    return {
      action: "accept",
      content: { api_url: "https://example.kaiten.ru", api_token: "dummy-token" },
    };
  });

  await client.connect(transport);

  try {
    // Инструменту нужны креды -> сервер инициирует elicitation у этого клиента.
    await client.callTool({ name: "kaiten_get_current_user", arguments: {} });
  } catch {
    // Реальный вызов Kaiten ожидаемо падает — это не важно для теста.
  }

  await client.close();

  const problems: string[] = [];
  if (!elicitCalled) problems.push("сервер не инициировал запрос кредов (elicitation)");
  if (!askedForUrl) problems.push("в запросе нет поля api_url");
  if (!askedForToken) problems.push("в запросе нет поля api_token");

  if (problems.length > 0) {
    process.stderr.write(`Тест elicitation НЕ пройден:\n - ${problems.join("\n - ")}\n`);
    process.exit(1);
  }

  process.stdout.write("OK: сервер запросил у клиента api_url и api_token через elicitation.\n");
  process.stdout.write(`Сообщение пользователю: "${promptMessage}"\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`Тест elicitation упал: ${message}\n`);
  process.exit(1);
});
