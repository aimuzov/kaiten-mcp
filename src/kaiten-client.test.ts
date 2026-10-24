import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'

import type { Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { KaitenApiError, KaitenClient, retryDelay, toQuery } from './kaiten-client.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 2, logLevel: 'error' }

let unavailable = 0

const kaiten = await fakeKaiten({
	'GET /cards': () => ({ body: [] }),
	'PATCH /cards/1': (req) => ({ body: JSON.parse(req.body) }),
	'DELETE /cards/1': () => ({ status: 200 }),
	'GET /flaky': () => (unavailable++ < 1 ? { status: 503, headers: { 'retry-after': '0' } } : { body: { ok: true } }),
	'GET /broken': () => ({ status: 400, body: { message: 'Bad column' } }),
})

after(() => kaiten.close())

const client = (token = GOOD_TOKEN) =>
	new KaitenClient(config, new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: token }, quiet), quiet)

test('query без undefined и null, значения строкой', () => {
	assert.equal(toQuery({ a: 1, b: undefined, c: null, d: 'x,y', e: false }), '?a=1&d=x%2Cy&e=false')
	assert.equal(toQuery({}), '')
})

test('пауза повтора: Retry-After в секундах, иначе экспонента до 5 секунд', () => {
	assert.equal(retryDelay('2', 1), 2000)
	assert.equal(retryDelay(null, 1), 500)
	assert.equal(retryDelay('soon', 2), 1000)
	assert.equal(retryDelay(null, 10), 5000)
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
