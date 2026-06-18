import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import type { KaitenClient } from "../kaiten-client.js";
import type { Logger } from "../logger.js";

/** Общий контекст, доступный всем модулям инструментов. */
export interface ToolContext {
  server: McpServer;
  client: KaitenClient;
  logger: Logger;
  config: Config;
}

/** Форматирует данные как текстовый JSON-результат инструмента. */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Текстовый результат (без JSON-обёртки). */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Результат-ошибка инструмента. */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Выполняет асинхронную операцию инструмента, превращая результат в JSON
 * и аккуратно обрабатывая ошибки (в т.ч. ошибки Kaiten API).
 */
export async function run(ctx: ToolContext, fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("Tool execution failed", { message });
    return errorResult(`Ошибка: ${message}`);
  }
}

/**
 * Убирает из объекта-параметра ключи со значением undefined,
 * чтобы не отправлять их в query/тело запроса Kaiten.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}
