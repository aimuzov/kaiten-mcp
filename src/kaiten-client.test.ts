import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, describe, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { createLogger } from '@aimuzov/infra-mcp-kit'

import { loadConfig, type Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { canRetry, KaitenApiError, KaitenClient, retryDelay, toQuery } from './kaiten-client.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 2, logLevel: 'error' }

let unavailable = 0
let down = 0
let limited = 0
let waited = 0
let gone = 0
let busy = 0
let inFlight = 0
let maxInFlight = 0

/** Записи, которые Kaiten мог уже выполнить: на 5xx без Retry-After повтора быть не должно. */
const WRITE_FAILURES = (['POST', 'PATCH'] as const).flatMap((method) =>
	[500, 502, 503, 504].map((status) => ({ method, status, path: `/write-${status}` })),
)

const kaiten = await fakeKaiten({
	'GET /cards': () => ({ body: [] }),
	'PATCH /cards/1': (req) => ({ body: JSON.parse(req.body) }),
	'DELETE /cards/1': () => ({ status: 200 }),
	'GET /flaky': () => (unavailable++ < 1 ? { status: 503, headers: { 'retry-after': '0' } } : { body: { ok: true } }),
	'GET /broken': () => ({ status: 400, body: { message: 'Bad column' } }),
	'POST /cards': () => ({ status: 502, body: { message: 'Bad gateway' } }),
	'GET /down': () => (down++ < 1 ? { status: 500 } : { body: { ok: true } }),
	'POST /limited': () => (limited++ < 1 ? { status: 429, headers: { 'retry-after': '0' } } : { body: { id: 1 } }),
	'GET /sso': () => ({ raw: '<html>Войдите</html>', headers: { 'content-type': 'text/html' } }),
	'GET /always-503': () => ({ status: 503, headers: { 'retry-after': '0' } }),
	'GET /always-429': () => ({ status: 429, headers: { 'retry-after': '0' }, body: { message: 'Too many' } }),
	'GET /wait': () => (waited++ < 1 ? { status: 429, headers: { 'retry-after': '0.3' } } : { body: { waited: true } }),
	'DELETE /gone': () => (gone++ < 1 ? { status: 500 } : {}),
	'POST /busy': () => (busy++ < 1 ? { status: 503, headers: { 'retry-after': '0' } } : { body: { id: 2 } }),
	'GET /slow': async () => {
		await sleep(1500)

		return { body: { late: true } }
	},
	'GET /parallel': async () => {
		inFlight += 1
		maxInFlight = Math.max(maxInFlight, inFlight)
		await sleep(50)
		inFlight -= 1

		return { body: { ok: true } }
	},
	'GET /err-text': () => ({ status: 400, raw: 'plain failure' }),
	'GET /err-long': () => ({ status: 400, raw: 'x'.repeat(600) }),
	'GET /err-field': () => ({ status: 403, body: { error: 'Forbidden thing' } }),
	'GET /err-empty': () => ({ status: 404 }),
	'GET /old': () => ({ status: 302, headers: { location: '/api/latest/new' } }),
	'GET /new': () => ({ body: { moved: true } }),
	'PUT /cards/1/position': (req) => ({ body: JSON.parse(req.body) }),
	...Object.fromEntries(
		WRITE_FAILURES.map(({ method, status, path }) => [
			`${method} ${path}`,
			() => ({ status, body: { message: 'Упало' } }),
		]),
	),
})

after(() => kaiten.close())

const client = (token = GOOD_TOKEN, cfg = config, options = {}) =>
	new KaitenClient(cfg, new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: token }, quiet), quiet, options)

/** Сколько раз Kaiten получил запрос на этот путь. */
const hits = (method: string, path: string) =>
	kaiten.requests.filter((r) => r.method === method && new URL(r.url, 'http://x').pathname === `/api/latest${path}`)
		.length

test('query без undefined и null, значения строкой', () => {
	assert.equal(toQuery({ a: 1, b: undefined, c: null, d: 'x,y', e: false }), '?a=1&d=x%2Cy&e=false')
	assert.equal(toQuery({}), '')
})

test('пауза повтора: Retry-After в секундах, иначе экспонента до 5 секунд', () => {
	assert.equal(retryDelay('2', 1), 2000)
	assert.equal(retryDelay(null, 1), 500)
	assert.equal(retryDelay('soon', 2), 1000)
	assert.equal(retryDelay(null, 10), 5000)
	assert.equal(retryDelay('3600', 1), 60_000)
	assert.equal(retryDelay('-5', 1), 0)
})

test('на 5xx повторяются только GET, PUT и DELETE, на 429 и 503 с Retry-After -- все', () => {
	assert.equal(canRetry('GET', 500, null), true)
	assert.equal(canRetry('DELETE', 504, null), true)
	assert.equal(canRetry('POST', 500, null), false)
	assert.equal(canRetry('PATCH', 502, null), false)
	assert.equal(canRetry('POST', 503, null), false)
	assert.equal(canRetry('POST', 503, '1'), true)
	assert.equal(canRetry('POST', 429, null), true)
	assert.equal(canRetry('GET', 400, null), false)
})

test('GET уходит с токеном и query, тело PATCH -- JSON', async () => {
	await client().listCards({ board_id: 3, skip: undefined })

	assert.equal(
		await client()
			.patch('/cards/1', { title: 'x', due_date: null })
			.then((r) => JSON.stringify(r)),
		'{"title":"x","due_date":null}',
	)

	const get = kaiten.requests.find((r) => r.url.startsWith('/api/latest/cards?'))

	assert.equal(get?.url, '/api/latest/cards?board_id=3')
	assert.equal(get?.auth, `Bearer ${GOOD_TOKEN}`)
})

test('пустой ответ DELETE даёт null', async () => {
	assert.equal(await client().delete('/cards/1'), null)
})

test('503 повторяется, пока Kaiten не ответит', async () => {
	assert.deepEqual(await client().get('/flaky'), { ok: true })
})

test('ошибка Kaiten несёт статус и его сообщение', async () => {
	await assert.rejects(client().get('/broken'), (error: unknown) => {
		assert.ok(error instanceof KaitenApiError)
		assert.equal(error.status, 400)
		assert.match(error.message, /GET \/broken failed \(HTTP 400\): Bad column/)

		return true
	})

	await assert.rejects(client('bad').getCurrentUser(), { status: 401 })
})

test('POST после 5xx не повторяется, чтобы не создать дубль', async () => {
	const before = kaiten.requests.length

	await assert.rejects(client().post('/cards', { title: 'x' }), { status: 502 })
	assert.equal(kaiten.requests.length - before, 1)
})

test('GET после 500 повторяется, POST после 429 тоже', async () => {
	assert.deepEqual(await client().get('/down'), { ok: true })
	assert.deepEqual(await client().post('/limited', {}), { id: 1 })
})

test('успешный ответ не-JSON -- ошибка, а не строка вместо данных', async () => {
	await assert.rejects(client().get('/sso'), (error: unknown) => {
		assert.ok(error instanceof KaitenApiError)
		assert.match(error.message, /Kaiten вернул не JSON/)

		return true
	})
})

describe('повторы', () => {
	test('GET на 503 с Retry-After повторяется три раза, потом ошибка со статусом', async () => {
		await assert.rejects(client().get('/always-503'), { status: 503 })
		assert.equal(hits('GET', '/always-503'), 4)
	})

	test('на 429 повторы тоже кончаются, ошибка несёт сообщение Kaiten', async () => {
		await assert.rejects(client().get('/always-429'), (error: unknown) => {
			assert.ok(error instanceof KaitenApiError)
			assert.equal(error.status, 429)
			assert.equal(error.message, 'Kaiten API GET /always-429 failed (HTTP 429): Too many')

			return true
		})

		assert.equal(hits('GET', '/always-429'), 4)
	})

	test('пауза перед повтором берётся из Retry-After', async () => {
		const started = performance.now()

		assert.deepEqual(await client().get('/wait'), { waited: true })
		assert.ok(performance.now() - started >= 250, 'Retry-After: 0.3 -- не меньше 300 мс')
		assert.equal(hits('GET', '/wait'), 2)
	})

	for (const { method, status, path } of WRITE_FAILURES) {
		test(`${method} после ${status} не повторяется`, async () => {
			const request =
				method === 'POST' ? client().post(path, { title: 'x' }) : client().patch(path, { title: 'x' })

			await assert.rejects(request, {
				status,
				message: `Kaiten API ${method} ${path} failed (HTTP ${status}): Упало`,
			})

			assert.equal(hits(method, path), 1)
		})
	}

	test('POST на 503 с Retry-After повторяется: Kaiten запрос не принял', async () => {
		assert.deepEqual(await client().post('/busy', {}), { id: 2 })
		assert.equal(hits('POST', '/busy'), 2)
	})

	test('DELETE после 500 повторяется: он идемпотентный', async () => {
		assert.equal(await client().delete('/gone'), null)
		assert.equal(hits('DELETE', '/gone'), 2)
	})

	test('4xx не повторяется', async () => {
		const before = hits('GET', '/err-field')

		await assert.rejects(client().get('/err-field'))
		assert.equal(hits('GET', '/err-field') - before, 1)
	})
})

describe('тексты ошибок', () => {
	test('сообщение из поля error, текст тела как есть, длинное тело и пустое -- без хвоста', async () => {
		await assert.rejects(client().get('/err-field'), {
			status: 403,
			message: 'Kaiten API GET /err-field failed (HTTP 403): Forbidden thing',
			details: { error: 'Forbidden thing' },
		})

		await assert.rejects(client().get('/err-text'), {
			status: 400,
			message: 'Kaiten API GET /err-text failed (HTTP 400): plain failure',
			details: 'plain failure',
		})

		await assert.rejects(client().get('/err-long'), {
			status: 400,
			message: 'Kaiten API GET /err-long failed (HTTP 400)',
		})

		await assert.rejects(client().get('/err-empty'), {
			status: 404,
			message: 'Kaiten API GET /err-empty failed (HTTP 404)',
			details: null,
		})

		await assert.rejects(client('bad').getCurrentUser(), {
			message: 'Kaiten API GET /users/current failed (HTTP 401): Unauthorized',
		})
	})

	test('успешный не-JSON: статус и начало тела в details', async () => {
		await assert.rejects(client().get('/sso'), {
			name: 'KaitenApiError',
			status: 200,
			message: 'Kaiten API GET /sso: Kaiten вернул не JSON (HTTP 200)',
			details: '<html>Войдите</html>',
		})
	})

	test('недоступный Kaiten -- сетевая ошибка без статуса', async () => {
		const server = createServer()

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

		const { port } = server.address() as AddressInfo

		await new Promise((resolve) => server.close(resolve))

		const offline = new KaitenClient(
			config,
			new CredentialsProvider({ apiUrl: `http://127.0.0.1:${port}/api/latest`, apiToken: GOOD_TOKEN }, quiet),
			quiet,
		)

		await assert.rejects(offline.get('/cards'), (error: unknown) => {
			assert.ok(error instanceof KaitenApiError)
			assert.equal(error.status, undefined)
			assert.equal(error.message, 'Kaiten API GET /cards failed: fetch failed')

			return true
		})
	})

	test('без кредов запрос не уходит, ошибка про KAITEN_API_URL и KAITEN_API_TOKEN', async () => {
		const before = kaiten.requests.length
		const empty = new KaitenClient(config, new CredentialsProvider({}, quiet), quiet)

		await assert.rejects(empty.getCurrentUser(), /KAITEN_API_URL и KAITEN_API_TOKEN/)
		assert.equal(kaiten.requests.length, before)
	})
})

describe('таймаут и лимит запросов', () => {
	test('запрос дольше KAITEN_REQUEST_TIMEOUT_MS обрывается и не повторяется', async () => {
		const cfg = loadConfig({ KAITEN_REQUEST_TIMEOUT_MS: '1000' })
		const started = performance.now()

		await assert.rejects(client(GOOD_TOKEN, cfg).get('/slow'), {
			message: 'Kaiten API GET /slow failed: таймаут запроса',
		})

		const elapsed = performance.now() - started

		assert.ok(elapsed >= 950 && elapsed < 1450, `оборвался через ${Math.round(elapsed)} мс`)
		assert.equal(hits('GET', '/slow'), 1)
	})

	test('одновременных запросов не больше KAITEN_MAX_CONCURRENT_REQUESTS, остальные ждут', async () => {
		for (const limit of [1, 3]) {
			const shared = client(GOOD_TOKEN, loadConfig({ KAITEN_MAX_CONCURRENT_REQUESTS: String(limit) }))

			maxInFlight = 0

			const results = await Promise.all(Array.from({ length: 7 }, () => shared.get('/parallel')))

			assert.equal(results.length, 7)
			assert.ok(results.every((r) => JSON.stringify(r) === '{"ok":true}'))
			assert.equal(maxInFlight, limit)
		}
	})

	test('слот освобождается и после ошибки', async () => {
		const shared = client(GOOD_TOKEN, { ...config, maxConcurrentRequests: 1 })

		await assert.rejects(shared.get('/err-field'))
		await assert.rejects(shared.get('/err-field'))
		assert.deepEqual(await shared.get('/parallel'), { ok: true })
	})
})

describe('редиректы и прочие методы', () => {
	test('без проверки адреса редирект проходится', async () => {
		assert.deepEqual(await client().get('/old'), { moved: true })
	})

	test('с проверкой адреса редирект -- ошибка, а проверка идёт перед каждым запросом', async () => {
		const checked: string[] = []
		const guarded = client(GOOD_TOKEN, config, {
			guardUrl: async (url: string) => {
				checked.push(url)
			},
		})
		const before = hits('GET', '/new')

		await assert.rejects(guarded.get('/old'), {
			status: 302,
			message: 'Kaiten API GET /old: адрес отвечает редиректом (HTTP 302)',
		})

		await assert.rejects(guarded.get('/old'))
		assert.equal(hits('GET', '/new'), before)
		assert.deepEqual(checked, [kaiten.apiUrl, kaiten.apiUrl])
	})

	test('PUT шлёт тело JSON', async () => {
		assert.deepEqual(await client().put('/cards/1/position', { sort_order: 3 }), { sort_order: 3 })

		const sent = kaiten.requests.findLast((r) => r.method === 'PUT')

		assert.equal(sent?.body, '{"sort_order":3}')
	})
})
