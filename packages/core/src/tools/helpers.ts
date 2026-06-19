import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Config } from '../config.js'
import type { KaitenClient } from '../kaiten-client.js'
import type { Logger } from '../logger.js'

/** Доп. контекст вызова инструмента (extra из MCP SDK). */
export type ToolExtra = unknown

export interface ToolContext {
	server: McpServer
	logger: Logger
	config: Config
	/** Резолвит клиента Kaiten для конкретного вызова. */
	getClient(extra: ToolExtra): KaitenClient
}

export function makeToolContext(input: {
	server: McpServer
	logger: Logger
	config: Config
	resolveClient: (extra: ToolExtra) => KaitenClient
}): ToolContext {
	return {
		server: input.server,
		logger: input.logger,
		config: input.config,
		getClient: input.resolveClient,
	}
}

export function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

/** Текстовый результат (без JSON-обёртки). */
export function textResult(text: string): CallToolResult {
	return { content: [{ type: 'text', text }] }
}

export function errorResult(message: string): CallToolResult {
	return { content: [{ type: 'text', text: message }], isError: true }
}

/** Выполняет операцию инструмента: резолвит клиент из extra, ловит ошибки. */
export async function run(
	ctx: ToolContext,
	extra: ToolExtra,
	fn: (client: KaitenClient) => Promise<unknown>,
): Promise<CallToolResult> {
	try {
		const client = ctx.getClient(extra)
		return jsonResult(await fn(client))
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		ctx.logger.error('Tool execution failed', { message })
		return errorResult(`Ошибка: ${message}`)
	}
}

/**
 * Убирает из объекта-параметра ключи со значением undefined,
 * чтобы не отправлять их в query/тело запроса Kaiten.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const out: Partial<T> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			out[key as keyof T] = value as T[keyof T]
		}
	}
	return out
}
