import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { createLogger, type Logger } from '@aimuzov/infra-mcp-kit'
import { createHttpApp, memoryStore, type HttpConfig } from '@aimuzov/infra-mcp-kit/http'
import {
	connectHttp,
	hiddenField,
	oauthFlow,
	startHttp,
	textOf,
	type RunningHttp,
} from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from './config.ts'
import { ClientCache, hostedOptions } from './http.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'
import type { UrlGuard } from './url-guard.ts'

const quiet = createLogger({ level: 'error', write: () => {} })
const base: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const kaiten = await fakeKaiten()
const failing = await fakeKaiten({ 'GET /users/current': () => ({ status: 500, headers: { 'retry-after': '0' } }) })
const moving = await fakeKaiten({
	'GET /users/current': () => ({ status: 302, headers: { location: 'http://169.254.169.254/' } }),
})
const running: RunningHttp[] = []

after(async () => {
	await Promise.all(running.map((r) => r.close()))
	await kaiten.close()
	await failing.close()
	await moving.close()
})

// Фейковый Kaiten живёт на http://127.0.0.1, настоящая проверка его не пустит.
const allowAll: UrlGuard = async () => {}

type StartOptions = { config?: Config; realGuard?: boolean; logger?: Logger }

async function start({ config = base, realGuard = false, logger = quiet }: StartOptions = {}): Promise<string> {
	const guardUrl = realGuard ? undefined : allowAll

	const app = await startHttp((url) => {
		const http: HttpConfig = {
			port: 0,
			publicUrl: new URL(url),
			authSecret: 'x'.repeat(32),
			allowedRedirectUris: [],
		}

		return createHttpApp(hostedOptions({ config, logger, http, store: memoryStore(), guardUrl })).app
	})

	running.push(app)

	return app.base
}

const submit = (fields: Record<string, string>) => (page: string, callback: URL) =>
	fetch(callback, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ request: hiddenField(page, 'request'), ...fields }),
	})

describe('удалённый коннектор', () => {
	test('вход токеном Kaiten доводит до инструмента, а сам токен из токена доступа не читается', async () => {
		const url = await start()
		const flow = await oauthFlow({
			base: url,
			login: submit({ kaiten_url: kaiten.apiUrl, kaiten_token: GOOD_TOKEN }),
		})
		const leaked = flow.tokens.access_token
			.split('.')
			.some((part) => Buffer.from(part, 'base64url').toString().includes(GOOD_TOKEN))

		assert.ok(!leaked)

		const client = await connectHttp(url, flow.tokens.access_token)

		assert.equal(
			JSON.parse(textOf(await client.callTool({ name: 'kaiten_get_current_user', arguments: {} }))).id,
			7,
		)

		await client.close()
	})

	test('код меняется на токены только один раз', async () => {
		const flow = await oauthFlow({
			base: await start(),
			login: submit({ kaiten_url: kaiten.apiUrl, kaiten_token: GOOD_TOKEN }),
		})
		const again = await flow.exchangeAgain()

		assert.equal(again.status, 400)
		assert.equal(((await again.json()) as { error: string }).error, 'invalid_grant')
	})

	test('неверный токен возвращает форму с ошибкой, а не выдаёт код', async () => {
		await assert.rejects(
			oauthFlow({ base: await start(), login: submit({ kaiten_url: kaiten.apiUrl, kaiten_token: 'bad' }) }),
			/Kaiten не узнал этот токен/,
		)
	})

	test('с KAITEN_API_URL адрес на форме не спрашивается', async () => {
		const url = await start({ config: { ...base, apiUrl: kaiten.apiUrl } })
		const flow = await oauthFlow({
			base: url,
			login: async (page, callback) => {
				assert.doesNotMatch(page, /name="kaiten_url"/)

				return submit({ kaiten_token: GOOD_TOKEN })(page, callback)
			},
		})

		assert.ok(flow.tokens.access_token)
	})

	test('адрес без Kaiten API -- так и сказано на форме', async () => {
		const wrong = kaiten.apiUrl.replace('/api/latest', '/nope')

		await assert.rejects(
			oauthFlow({ base: await start(), login: submit({ kaiten_url: wrong, kaiten_token: GOOD_TOKEN }) }),
			/нет Kaiten API/,
		)
	})

	test('мусор вместо адреса не доходит до запроса', async () => {
		await assert.rejects(
			oauthFlow({
				base: await start(),
				login: submit({ kaiten_url: 'https://exa mple', kaiten_token: GOOD_TOKEN }),
			}),
			/не похоже на адрес Kaiten/,
		)
	})

	test('сбой Kaiten при входе пишется в лог с хостом, статусом и сообщением', async () => {
		const lines: string[] = []
		const logger = createLogger({ level: 'warn', write: (line) => lines.push(line) })
		const host = new URL(failing.apiUrl).host

		await assert.rejects(
			oauthFlow({
				base: await start({ logger }),
				login: submit({ kaiten_url: failing.apiUrl, kaiten_token: GOOD_TOKEN }),
			}),
			/Не получилось достучаться до Kaiten/,
		)

		const warning = lines.find((line) => line.includes('Kaiten login check failed'))

		assert.ok(warning)
		assert.ok(warning.includes(host))
		assert.match(warning, /500/)
		assert.match(warning, /HTTP 500/)
	})

	test('редирект при входе -- ошибка, по нему не идём', async () => {
		await assert.rejects(
			oauthFlow({ base: await start(), login: submit({ kaiten_url: moving.apiUrl, kaiten_token: GOOD_TOKEN }) }),
			/отвечает редиректом/,
		)

		assert.equal(moving.requests.length, 1)
	})

	test('без KAITEN_API_URL форма не пускает на http и во внутреннюю сеть', async () => {
		const url = await start({ realGuard: true })
		const port = new URL(kaiten.apiUrl).port
		const login = (kaitenUrl: string) =>
			oauthFlow({ base: url, login: submit({ kaiten_url: kaitenUrl, kaiten_token: GOOD_TOKEN }) })
		const before = kaiten.requests.length

		await assert.rejects(login(kaiten.apiUrl), /должен начинаться с https/)
		await assert.rejects(login(`https://127.0.0.1:${port}`), /внутреннюю сеть/)
		await assert.rejects(login('https://localhost'), /внутреннюю сеть/)
		await assert.rejects(login('https://[::1]'), /внутреннюю сеть/)
		assert.equal(kaiten.requests.length, before)
	})

	test('лендинг в стиле кита и /health', async () => {
		const url = await start()

		assert.match(await (await fetch(url)).text(), /kaiten[\s\S]*\/mcp/)
		assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ok: true })
		assert.equal((await fetch(`${url}/mcp`, { method: 'POST', body: '{}' })).status, 401)
	})
})

describe('кэш клиентов', () => {
	test('один клиент на пару адрес и токен, давно не нужные вытесняются', () => {
		const cache = new ClientCache(base, quiet, { max: 2 })
		const a = cache.get('https://a', 't1')

		cache.get('https://b', 't2')
		assert.equal(cache.get('https://a', 't1'), a)

		cache.get('https://c', 't3')
		assert.equal(cache.size, 2)
		assert.equal(cache.get('https://a', 't1'), a, 'a недавно брали, вытеснен b')
	})

	test('без кредов в authInfo -- понятная ошибка', () => {
		const cache = new ClientCache(base, quiet)

		assert.throws(() => cache.forAuth(undefined), /Нет учётных данных Kaiten/)

		assert.throws(
			() => cache.forAuth({ token: 't', clientId: 'c', scopes: [], extra: { kaitenToken: 't' } }),
			/Не задан Kaiten URL/,
		)
	})
})
