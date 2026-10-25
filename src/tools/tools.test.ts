import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { connectInMemory, textOf } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from '#kaiten/config'
import { CredentialsProvider } from '#kaiten/credentials'
import { createStdioServer } from '#kaiten/server'
import { fakeKaiten, GOOD_TOKEN, type FakeRequest, type Route } from '#kaiten/testing/fake-kaiten'

/**
 * Вызов инструмента и запрос, который он должен отправить в Kaiten. Без `result`
 * инструмент обязан вернуть ответ Kaiten как есть.
 */
type Case = {
	tool: string
	args: Record<string, unknown>
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
	path: string
	query?: Record<string, string>
	body?: unknown
	result?: unknown
}

const CASES: Case[] = [
	{ tool: 'kaiten_get_current_user', args: {}, method: 'GET', path: '/users/current' },
	{
		tool: 'kaiten_list_users',
		args: { query: 'Иван', limit: 10, offset: 0 },
		method: 'GET',
		path: '/users',
		query: { query: 'Иван', limit: '10', offset: '0' },
	},
	{ tool: 'kaiten_list_spaces', args: {}, method: 'GET', path: '/spaces' },
	{ tool: 'kaiten_get_space', args: { space_id: 3 }, method: 'GET', path: '/spaces/3' },
	{ tool: 'kaiten_list_boards', args: { space_id: 3 }, method: 'GET', path: '/spaces/3/boards' },
	{ tool: 'kaiten_get_board', args: { board_id: 4 }, method: 'GET', path: '/boards/4' },
	{ tool: 'kaiten_list_columns', args: { board_id: 4 }, method: 'GET', path: '/boards/4/columns' },
	{ tool: 'kaiten_list_lanes', args: { board_id: 4 }, method: 'GET', path: '/boards/4/lanes' },
	{ tool: 'kaiten_list_card_types', args: {}, method: 'GET', path: '/card-types' },
	{ tool: 'kaiten_list_tags', args: {}, method: 'GET', path: '/tags' },
	{ tool: 'kaiten_get_card', args: { card_id: 5 }, method: 'GET', path: '/cards/5' },
	{
		tool: 'kaiten_create_card',
		args: { board_id: 1, column_id: 2, title: 'Новая', description: 'раз\\nдва', asap: true },
		method: 'POST',
		path: '/cards',
		body: { board_id: 1, column_id: 2, title: 'Новая', description: 'раз\nдва', asap: true },
	},
	{
		tool: 'kaiten_update_card',
		args: { card_id: 5, title: 'Другая', due_date: null, description: 'a\\tb' },
		method: 'PATCH',
		path: '/cards/5',
		// card_id в тело не уходит, а null остаётся: так Kaiten сбрасывает срок.
		body: { title: 'Другая', due_date: null, description: 'a\tb' },
	},
	{
		tool: 'kaiten_move_card',
		args: { card_id: 5, column_id: 8, lane_id: 9 },
		method: 'PATCH',
		path: '/cards/5',
		body: { column_id: 8, lane_id: 9 },
	},
	{
		tool: 'kaiten_delete_card',
		args: { card_id: 5 },
		method: 'DELETE',
		path: '/cards/5',
		result: { deleted: true, card_id: 5 },
	},
	{ tool: 'kaiten_archive_card', args: { card_id: 5 }, method: 'PATCH', path: '/cards/5', body: { condition: 2 } },
	{
		tool: 'kaiten_add_card_member',
		args: { card_id: 5, user_id: 7 },
		method: 'POST',
		path: '/cards/5/members',
		body: { user_id: 7 },
	},
	{
		tool: 'kaiten_remove_card_member',
		args: { card_id: 5, user_id: 7 },
		method: 'DELETE',
		path: '/cards/5/members/7',
		result: { removed: true, user_id: 7 },
	},
	{
		tool: 'kaiten_add_card_tag',
		args: { card_id: 5, name: 'bug' },
		method: 'POST',
		path: '/cards/5/tags',
		body: { name: 'bug' },
	},
	{
		tool: 'kaiten_remove_card_tag',
		args: { card_id: 5, tag_id: 11 },
		method: 'DELETE',
		path: '/cards/5/tags/11',
		result: { removed: true, tag_id: 11 },
	},
	{
		tool: 'kaiten_list_card_external_links',
		args: { card_id: 5 },
		method: 'GET',
		path: '/cards/5/external-links',
	},
	{
		tool: 'kaiten_add_card_external_link',
		args: { card_id: 5, url: 'https://git.example/mr/1', description: 'MR !1' },
		method: 'POST',
		path: '/cards/5/external-links',
		body: { url: 'https://git.example/mr/1', description: 'MR !1' },
	},
	{
		tool: 'kaiten_add_card_external_link',
		args: { card_id: 5, url: 'https://git.example/mr/2' },
		method: 'POST',
		path: '/cards/5/external-links',
		body: { url: 'https://git.example/mr/2' },
	},
	{
		tool: 'kaiten_update_card_external_link',
		args: { card_id: 5, external_link_id: 12, description: 'MR !12' },
		method: 'PATCH',
		path: '/cards/5/external-links/12',
		body: { description: 'MR !12' },
	},
	{
		tool: 'kaiten_remove_card_external_link',
		args: { card_id: 5, external_link_id: 12 },
		method: 'DELETE',
		path: '/cards/5/external-links/12',
		result: { removed: true, external_link_id: 12 },
	},
	{
		tool: 'kaiten_search_cards',
		args: {
			query: 'отчёт',
			board_id: 4,
			member_ids: [1, 2],
			tag_ids: [3],
			archived: false,
			limit: 20,
			offset: 40,
			extra_params: { states: '1,2', custom: true },
		},
		method: 'GET',
		path: '/cards',
		// Списки Kaiten ждёт строкой через запятую, extra_params уходят как есть.
		query: {
			query: 'отчёт',
			board_id: '4',
			member_ids: '1,2',
			tag_ids: '3',
			archived: 'false',
			limit: '20',
			offset: '40',
			states: '1,2',
			custom: 'true',
		},
	},
	{
		tool: 'kaiten_search_cards',
		args: { member_ids: [], tag_ids: [] },
		method: 'GET',
		path: '/cards',
		query: {},
	},
	{ tool: 'kaiten_list_comments', args: { card_id: 5 }, method: 'GET', path: '/cards/5/comments' },
	{
		tool: 'kaiten_create_comment',
		args: { card_id: 5, text: 'Привет' },
		method: 'POST',
		path: '/cards/5/comments',
		body: { text: 'Привет' },
	},
	{
		tool: 'kaiten_update_comment',
		args: { card_id: 5, comment_id: 13, text: 'Поправил' },
		method: 'PATCH',
		path: '/cards/5/comments/13',
		body: { text: 'Поправил' },
	},
	{
		tool: 'kaiten_delete_comment',
		args: { card_id: 5, comment_id: 13 },
		method: 'DELETE',
		path: '/cards/5/comments/13',
		result: { deleted: true, comment_id: 13 },
	},
	{ tool: 'kaiten_list_checklists', args: { card_id: 5 }, method: 'GET', path: '/cards/5/checklists' },
	{
		tool: 'kaiten_add_checklist',
		args: { card_id: 5, name: 'Релиз' },
		method: 'POST',
		path: '/cards/5/checklists',
		body: { name: 'Релиз' },
	},
	{
		tool: 'kaiten_add_checklist_item',
		args: { card_id: 5, checklist_id: 14, text: 'Собрать' },
		method: 'POST',
		path: '/cards/5/checklists/14/items',
		body: { text: 'Собрать' },
	},
	{
		tool: 'kaiten_update_checklist_item',
		args: { card_id: 5, checklist_id: 14, item_id: 15, checked: true },
		method: 'PATCH',
		path: '/cards/5/checklists/14/items/15',
		body: { checked: true },
	},
	{
		tool: 'kaiten_delete_checklist_item',
		args: { card_id: 5, checklist_id: 14, item_id: 15 },
		method: 'DELETE',
		path: '/cards/5/checklists/14/items/15',
		result: { deleted: true, item_id: 15 },
	},
	{ tool: 'kaiten_list_time_logs', args: { card_id: 5 }, method: 'GET', path: '/cards/5/time-logs' },
	{
		tool: 'kaiten_add_time_log',
		args: { card_id: 5, time_spent: 30, for_date: '2026-10-25', comment: 'Ревью', role_id: 2 },
		method: 'POST',
		path: '/cards/5/time-logs',
		body: { time_spent: 30, for_date: '2026-10-25', comment: 'Ревью', role_id: 2 },
	},
	{
		tool: 'kaiten_delete_time_log',
		args: { card_id: 5, time_log_id: 16 },
		method: 'DELETE',
		path: '/cards/5/time-logs/16',
		result: { deleted: true, time_log_id: 16 },
	},
]

/** Планировочные инструменты разбирает свой файл: у них несколько запросов и своя логика. */
const PLANNING = ['kaiten_today_tasks', 'kaiten_overdue_cards', 'kaiten_plan_day']

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }

// На DELETE Kaiten отвечает пустым телом, на остальное -- меткой маршрута, по ней видно,
// что инструмент вернул ответ Kaiten, а не что-то своё.
const routes: Record<string, Route> = {}

for (const { method, path } of CASES) {
	routes[`${method} ${path}`] = () => (method === 'DELETE' ? {} : { body: { from: `${method} ${path}` } })
}

const kaiten = await fakeKaiten(routes)

after(() => kaiten.close())

const connect = (overrides: Partial<Config> = {}) =>
	connectInMemory(
		createStdioServer(
			{ ...config, ...overrides },
			new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: GOOD_TOKEN }, quiet),
			quiet,
		),
	)

const client = await connect()

/** Вызвать инструмент и вернуть ответ вместе с запросами, что он отправил в Kaiten. */
async function call(tool: string, args: Record<string, unknown>, through = client) {
	const before = kaiten.requests.length
	const result = await through.callTool({ name: tool, arguments: args })

	return { result, sent: kaiten.requests.slice(before) }
}

const parts = (request: FakeRequest) => {
	const url = new URL(request.url, 'http://x')

	return {
		method: request.method,
		path: url.pathname.replace(/^\/api\/latest/, ''),
		query: Object.fromEntries(url.searchParams),
		body: request.body ? JSON.parse(request.body) : undefined,
	}
}

describe('каждый инструмент шлёт в Kaiten нужный запрос', () => {
	test('таблица покрывает все инструменты сервера', async () => {
		const { tools } = await client.listTools()
		const covered = new Set([...CASES.map((c) => c.tool), ...PLANNING])

		assert.deepEqual(
			tools.map((t) => t.name).filter((name) => !covered.has(name)),
			[],
		)
	})

	for (const c of CASES) {
		test(`${c.tool} ${JSON.stringify(c.args)}`, async () => {
			const { result, sent } = await call(c.tool, c.args)

			assert.equal(result.isError, undefined, textOf(result))
			assert.equal(sent.length, 1, 'ровно один запрос в Kaiten')

			const request = parts(sent[0]!)

			assert.equal(request.method, c.method)
			assert.equal(request.path, c.path)
			assert.deepEqual(request.query, c.query ?? {})
			assert.deepEqual(request.body, c.body)
			assert.deepEqual(JSON.parse(textOf(result)), c.result ?? { from: `${c.method} ${c.path}` })
		})
	}
})

describe('инструменты без запроса в Kaiten', () => {
	test('доски без space_id берутся из KAITEN_DEFAULT_SPACE_ID', async () => {
		const { result, sent } = await call('kaiten_list_boards', {}, await connect({ defaultSpaceId: 3 }))
		const paths = sent.map((r) => parts(r).path)

		assert.equal(result.isError, undefined)
		assert.deepEqual(paths, ['/spaces/3/boards'])
	})

	test('доски без space_id и без KAITEN_DEFAULT_SPACE_ID -- понятная ошибка, запроса нет', async () => {
		const { result, sent } = await call('kaiten_list_boards', {})

		assert.equal(result.isError, true)
		assert.equal(textOf(result), 'Не указан space_id и не задан KAITEN_DEFAULT_SPACE_ID')
		assert.equal(sent.length, 0)
	})

	test('перемещение без цели -- ошибка, карточка не трогается', async () => {
		const { result, sent } = await call('kaiten_move_card', { card_id: 5 })

		assert.equal(result.isError, true)
		assert.equal(textOf(result), 'Укажите хотя бы один из: column_id, lane_id, board_id')
		assert.equal(sent.length, 0)
	})

	test('ошибка Kaiten приходит инструменту текстом с isError', async () => {
		const { result, sent } = await call('kaiten_get_card', { card_id: 404 })

		assert.equal(result.isError, true)
		assert.equal(textOf(result), 'Kaiten API GET /cards/404 failed (HTTP 404): Not found')
		assert.equal(sent.length, 1)
	})
})
