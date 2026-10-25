import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { connectInMemory, expectTools, textOf } from '@aimuzov/infra-mcp-kit/testing'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import type { Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { createStdioServer } from './server.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'

/** Все инструменты, что были до переезда на кит: список из прежнего smoke-теста. */
const TOOLS = [
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

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const kaiten = await fakeKaiten()

after(() => kaiten.close())

const stdioServer = (initial: { apiUrl?: string; apiToken?: string } = {}) =>
	createStdioServer(config, new CredentialsProvider(initial, quiet), quiet)

test('сервер отдаёт все прежние инструменты и без кредов', async () => {
	await expectTools(await connectInMemory(stdioServer()), TOOLS)
})

test('с кредами из окружения инструмент ходит в Kaiten', async () => {
	const client = await connectInMemory(stdioServer({ apiUrl: kaiten.apiUrl, apiToken: GOOD_TOKEN }))
	const result = await client.callTool({ name: 'kaiten_get_current_user', arguments: {} })

	assert.equal(JSON.parse(textOf(result)).id, 7)
})

test('без кредов клиент без elicitation получает понятную ошибку', async () => {
	const client = await connectInMemory(stdioServer())
	const result = await client.callTool({ name: 'kaiten_get_current_user', arguments: {} })

	assert.equal(result.isError, true)
	assert.match(textOf(result), /KAITEN_API_URL и KAITEN_API_TOKEN/)
})

test('без кредов сервер спрашивает адрес и токен через elicitation один раз', async () => {
	// connectInMemory кита не объявляет возможностей клиента, а здесь нужна elicitation.
	const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: { elicitation: {} } })
	const asked: string[][] = []

	client.setRequestHandler(ElicitRequestSchema, async (request) => {
		const schema = 'requestedSchema' in request.params ? request.params.requestedSchema : undefined

		asked.push(Object.keys(schema?.properties ?? {}))

		return { action: 'accept', content: { api_url: kaiten.apiUrl, api_token: GOOD_TOKEN } }
	})

	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

	await Promise.all([stdioServer().connect(serverTransport), client.connect(clientTransport)])

	const [first, second] = await Promise.all([
		client.callTool({ name: 'kaiten_get_current_user', arguments: {} }),
		client.callTool({ name: 'kaiten_list_spaces', arguments: {} }),
	])

	assert.deepEqual(asked, [['api_url', 'api_token']])
	assert.equal(JSON.parse(textOf(first)).id, 7)
	assert.equal(second.isError, true, 'на /spaces фейковый Kaiten отвечает 404')
})
