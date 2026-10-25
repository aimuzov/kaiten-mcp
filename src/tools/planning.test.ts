import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { connectInMemory, textOf } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from '#kaiten/config'
import { CredentialsProvider } from '#kaiten/credentials'
import { createStdioServer } from '#kaiten/server'
import { fakeKaiten, GOOD_TOKEN } from '#kaiten/testing/fake-kaiten'
import type { KaitenCard } from '#kaiten/types'

const TODAY = '2026-06-17'

/** Набор на все ветки: сегодня, просрочено, будущее, без срока, готово, ASAP, без названия. */
const CARDS: KaitenCard[] = [
	{
		id: 1,
		title: 'Сегодня',
		board_id: 10,
		column_id: 20,
		due_date: '2026-06-17T12:00:00Z',
		responsible_id: 7,
		owner_id: 8,
	},
	{ id: 2, title: 'Давно ASAP', due_date: '2026-06-10', asap: true },
	{ id: 3, title: 'Просрочено', due_date: '2026-06-15T00:00:00.000Z' },
	{ id: 4, title: 'Без срока', due_date: null },
	{ id: 5, title: 'Потом', due_date: '2026-06-20' },
	{ id: 6, title: 'Готово', due_date: '2026-06-16', column: { id: 30, title: 'Done', type: 3 } },
	{ id: 7, title: 'Сегодня ASAP', due_date: '2026-06-17', asap: true },
	{ id: 8, title: 'Пустой срок', due_date: '' },
	{ id: 9, due_date: '2026-06-17' },
]

let cards: KaitenCard[] = CARDS

const kaiten = await fakeKaiten({ 'GET /cards': () => ({ body: cards }) })

after(() => kaiten.close())

beforeEach(() => {
	cards = CARDS
})

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const client = await connectInMemory(
	createStdioServer(config, new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: GOOD_TOKEN }, quiet), quiet),
)

async function call(tool: string, args: Record<string, unknown>) {
	const before = kaiten.requests.length
	const result = await client.callTool({ name: tool, arguments: args })
	const sent = kaiten.requests.slice(before).map((r) => {
		const url = new URL(r.url, 'http://x')

		return { path: url.pathname.replace(/^\/api\/latest/, ''), query: Object.fromEntries(url.searchParams) }
	})

	assert.equal(result.isError, undefined, textOf(result))

	return { data: JSON.parse(textOf(result)), sent }
}

const ids = (list: { id: number }[]) => list.map((c) => c.id)

describe('выборка карточек пользователя', () => {
	test('без user_id берётся текущий пользователь, роль по умолчанию -- ответственный', async () => {
		const { sent } = await call('kaiten_today_tasks', { as_of_date: TODAY })

		assert.deepEqual(sent, [
			{ path: '/users/current', query: {} },
			{ path: '/cards', query: { condition: '1', limit: '500', responsible_id: '7' } },
		])
	})

	test('с user_id текущий пользователь не запрашивается, фильтры и роль уходят в query', async () => {
		const cases = [
			{ role: 'owner', expected: { owner_id: '3' } },
			{ role: 'member', expected: { member_ids: '3' } },
			{ role: 'responsible', expected: { responsible_id: '3' } },
		]

		for (const { role, expected } of cases) {
			for (const tool of ['kaiten_today_tasks', 'kaiten_overdue_cards', 'kaiten_plan_day']) {
				const { sent } = await call(tool, {
					user_id: 3,
					role,
					space_id: 1,
					board_id: 2,
					limit: 50,
					as_of_date: TODAY,
				})

				assert.deepEqual(
					sent,
					[
						{
							path: '/cards',
							query: { space_id: '1', board_id: '2', condition: '1', limit: '50', ...expected },
						},
					],
					`${tool} ${role}`,
				)
			}
		}
	})
})

describe('kaiten_today_tasks', () => {
	test('сегодня и просроченное без готового, сначала ASAP, затем по сроку и id', async () => {
		const { data } = await call('kaiten_today_tasks', { as_of_date: TODAY })

		assert.equal(data.as_of_date, TODAY)
		assert.equal(data.total, 5)
		assert.equal(data.overdue_count, 2)
		assert.equal(data.due_today_count, 3)
		assert.deepEqual(ids(data.cards), [2, 7, 3, 1, 9])
	})

	test('карточка плана: срок датой, флаги и поля карточки', async () => {
		const { data } = await call('kaiten_today_tasks', { as_of_date: TODAY })

		assert.deepEqual(
			data.cards.find((c: { id: number }) => c.id === 1),
			{
				id: 1,
				title: 'Сегодня',
				board_id: 10,
				column_id: 20,
				due_date: '2026-06-17T12:00:00Z',
				due_date_key: '2026-06-17',
				responsible_id: 7,
				owner_id: 8,
				asap: false,
				overdue: false,
				due_today: true,
			},
		)

		assert.deepEqual(
			data.cards.find((c: { id: number }) => c.id === 2),
			{
				id: 2,
				title: 'Давно ASAP',
				due_date: '2026-06-10',
				due_date_key: '2026-06-10',
				asap: true,
				overdue: true,
				due_today: false,
			},
		)
	})

	test('include_overdue: false оставляет только сегодняшние', async () => {
		const { data } = await call('kaiten_today_tasks', { as_of_date: TODAY, include_overdue: false })

		assert.deepEqual(ids(data.cards), [7, 1, 9])
		assert.equal(data.overdue_count, 0)
		assert.equal(data.due_today_count, 3)
	})

	test('без as_of_date сегодня -- локальная дата процесса', async () => {
		const now = new Date()
		const local = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
			.map((n) => String(n).padStart(2, '0'))
			.join('-')
		const { data } = await call('kaiten_today_tasks', {})

		assert.equal(data.as_of_date, local)
	})

	test('дата не в формате YYYY-MM-DD отклоняется до запроса', async () => {
		const before = kaiten.requests.length
		const result = await client.callTool({ name: 'kaiten_today_tasks', arguments: { as_of_date: '17.06.2026' } })

		assert.equal(result.isError, true)
		assert.match(textOf(result), /as_of_date/)
		assert.equal(kaiten.requests.length, before)
	})

	test('срок с часовым поясом считается по локальной дате, а не по UTC', async () => {
		const tz = process.env.TZ

		process.env.TZ = 'Europe/Moscow'

		try {
			// 2026-06-16T21:30Z -- это 17 июня 00:30 по Москве.
			cards = [{ id: 1, title: 'Полночь', due_date: '2026-06-16T21:30:00.000Z' }]

			const { data } = await call('kaiten_today_tasks', { as_of_date: TODAY, include_overdue: false })

			assert.deepEqual(ids(data.cards), [1])
		} finally {
			process.env.TZ = tz
		}
	})

	test('срок без времени остаётся своей датой и к западу от UTC', async () => {
		const tz = process.env.TZ

		process.env.TZ = 'America/New_York'

		try {
			// По Нью-Йорку полночь UTC -- ещё 16 июня, но время у срока не задано.
			cards = [
				{ id: 1, title: 'Дата', due_date: `${TODAY}T00:00:00.000Z`, due_date_time_present: false },
				{ id: 2, title: 'Без времени', due_date: TODAY },
			]

			const { data } = await call('kaiten_today_tasks', { as_of_date: TODAY, include_overdue: false })

			assert.deepEqual(ids(data.cards), [1, 2])
		} finally {
			process.env.TZ = tz
		}
	})
})

describe('kaiten_overdue_cards', () => {
	test('только строго раньше сегодня и не в готовом', async () => {
		const { data } = await call('kaiten_overdue_cards', { as_of_date: TODAY })

		assert.deepEqual(Object.keys(data).sort(), ['as_of_date', 'cards', 'total'])
		assert.equal(data.as_of_date, TODAY)
		assert.equal(data.total, 2)
		assert.deepEqual(ids(data.cards), [2, 3])
		assert.ok(data.cards.every((c: { overdue: boolean }) => c.overdue))
	})
})

describe('kaiten_plan_day', () => {
	test('markdown с просроченным и сегодняшним, плюс те же карточки списками', async () => {
		const { data } = await call('kaiten_plan_day', { as_of_date: TODAY })

		assert.equal(
			data.plan_markdown,
			[
				'# План на 2026-06-17',
				'',
				'## Просрочено (2)',
				'- ASAP [#2] Давно ASAP (срок: 2026-06-10)',
				'- [#3] Просрочено (срок: 2026-06-15)',
				'',
				'## На сегодня (3)',
				'- ASAP [#7] Сегодня ASAP (срок: 2026-06-17)',
				'- [#1] Сегодня (срок: 2026-06-17)',
				'- [#9] (без названия) (срок: 2026-06-17)',
			].join('\n'),
		)

		assert.equal(data.as_of_date, TODAY)
		assert.deepEqual(ids(data.overdue), [2, 3])
		assert.deepEqual(ids(data.due_today), [7, 1, 9])
	})

	test('пустой день: заглушка в разделе и строка «нечего планировать»', async () => {
		cards = [CARDS[4]!]

		const { data } = await call('kaiten_plan_day', { as_of_date: TODAY })

		assert.equal(
			data.plan_markdown,
			[
				'# План на 2026-06-17',
				'',
				'## На сегодня (0)',
				'- Нет карточек со сроком на сегодня',
				'',
				'Нечего планировать: задач со сроком на сегодня и просроченных нет.',
			].join('\n'),
		)

		assert.deepEqual(data.overdue, [])
		assert.deepEqual(data.due_today, [])
	})

	test('только просроченное: раздел на сегодня с заглушкой, без строки «нечего планировать»', async () => {
		cards = [CARDS[2]!]

		const { data } = await call('kaiten_plan_day', { as_of_date: TODAY })

		assert.equal(
			data.plan_markdown,
			[
				'# План на 2026-06-17',
				'',
				'## Просрочено (1)',
				'- [#3] Просрочено (срок: 2026-06-15)',
				'',
				'## На сегодня (0)',
				'- Нет карточек со сроком на сегодня',
			].join('\n'),
		)
	})
})
