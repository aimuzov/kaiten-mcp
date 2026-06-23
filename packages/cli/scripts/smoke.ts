/**
 * Smoke-тест: запускает собранный MCP-сервер (dist/index.js) как подпроцесс
 * по stdio, подключается официальным MCP-клиентом и проверяет, что
 * initialize и tools/list работают и все ожидаемые инструменты на месте.
 *
 * Запуск: npm run build && npm run smoke
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const EXPECTED_TOOLS = [
	'kaiten_get_current_user',
	'kaiten_list_users',
	'kaiten_list_spaces',
	'kaiten_get_space',
	'kaiten_list_boards',
	'kaiten_get_board',
	'kaiten_list_columns',
	'kaiten_list_lanes',
	'kaiten_list_card_types',
	'kaiten_list_tags',
	'kaiten_get_card',
	'kaiten_create_card',
	'kaiten_update_card',
	'kaiten_move_card',
	'kaiten_delete_card',
	'kaiten_archive_card',
	'kaiten_add_card_member',
	'kaiten_remove_card_member',
	'kaiten_add_card_tag',
	'kaiten_remove_card_tag',
	'kaiten_list_card_external_links',
	'kaiten_add_card_external_link',
	'kaiten_update_card_external_link',
	'kaiten_remove_card_external_link',
	'kaiten_search_cards',
	'kaiten_list_comments',
	'kaiten_create_comment',
	'kaiten_update_comment',
	'kaiten_delete_comment',
	'kaiten_list_checklists',
	'kaiten_add_checklist',
	'kaiten_add_checklist_item',
	'kaiten_update_checklist_item',
	'kaiten_delete_checklist_item',
	'kaiten_list_time_logs',
	'kaiten_add_time_log',
	'kaiten_delete_time_log',
	'kaiten_today_tasks',
	'kaiten_overdue_cards',
	'kaiten_plan_day',
]

async function main(): Promise<void> {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['dist/index.js'],
		// Намеренно БЕЗ KAITEN_API_URL/TOKEN: сервер должен стартовать без кредов
		// (они запрашиваются лениво) и корректно отдавать tools/list.
		env: {
			...(process.env as Record<string, string>),
			KAITEN_LOG_LEVEL: 'error',
		},
	})

	const client = new Client({ name: 'kaiten-mcp-smoke', version: '0.0.0' })
	await client.connect(transport)

	const { tools } = await client.listTools()
	const names = new Set(tools.map((t) => t.name))

	process.stdout.write(`Сервер ответил. Инструментов: ${tools.length}\n`)
	for (const t of tools) {
		process.stdout.write(`  - ${t.name}\n`)
	}

	const missing = EXPECTED_TOOLS.filter((name) => !names.has(name))
	await client.close()

	if (missing.length > 0) {
		process.stderr.write(`\nОТСУТСТВУЮТ ожидаемые инструменты: ${missing.join(', ')}\n`)
		process.exit(1)
	}

	process.stdout.write(`\nOK: все ${EXPECTED_TOOLS.length} ожидаемых инструментов на месте.\n`)
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
	process.stderr.write(`Smoke-тест упал: ${message}\n`)
	process.exit(1)
})
