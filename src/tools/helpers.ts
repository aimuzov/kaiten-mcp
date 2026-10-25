import { failure, text, type CallToolResult, type Logger, type McpServer } from '@aimuzov/infra-mcp-kit'

import type { Config } from '#kaiten/config'
import type { KaitenClient } from '#kaiten/kaiten-client'

/** `extra` обработчика из SDK: в HTTP-режиме в нём `authInfo` с кредами Kaiten. */
export type ToolExtra = unknown

export type ToolContext = {
	server: McpServer
	logger: Logger
	config: Config
	/** Клиент Kaiten для этого вызова: в stdio один на процесс, в HTTP свой на каждого пользователя. */
	getClient(extra: ToolExtra): KaitenClient
}

/**
 * Ответ Kaiten уходит модели JSON-текстом. Не `json` кита: тот дублирует объект
 * в `structuredContent`, а ответы Kaiten большие, и без схемы выхода копия ничего не даёт.
 */
export const jsonText = (data: unknown): CallToolResult => text(JSON.stringify(data, null, 2))

/** Операция инструмента: клиент из `extra`, ответ JSON-текстом, ошибка ответом с `isError`. */
export async function run(
	ctx: ToolContext,
	extra: ToolExtra,
	fn: (client: KaitenClient) => Promise<unknown>,
): Promise<CallToolResult> {
	try {
		return jsonText(await fn(ctx.getClient(extra)))
	} catch (error) {
		ctx.logger.error('Tool execution failed', { message: error instanceof Error ? error.message : String(error) })

		return failure(error)
	}
}

/**
 * Литералы `\n`, `\r\n` и `\t` превращает в настоящие переносы и табуляцию. Они попадают
 * в значение, когда JSON тела собирают вручную (например `jq --arg`), и Kaiten сохранил бы
 * их видимым текстом. Не-строки возвращаются как есть.
 */
export function normalizeMultiline<T>(value: T): T {
	if (typeof value !== 'string') return value

	return value
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\t/g, '\t') as T
}

/**
 * Убирает ключи со значением undefined, чтобы они не ушли в запрос.
 * Явный null остаётся: так PATCH сбрасывает поле, например `due_date`.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>
}
