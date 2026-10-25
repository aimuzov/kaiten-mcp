import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { createLogger, type Logger } from '@aimuzov/infra-mcp-kit'
import { createHttpApp, memoryStore, type HttpConfig } from '@aimuzov/infra-mcp-kit/http'
import {
	connectHttp,
	fakePages,
	oauthFlow,
	startHttp,
	submitForm,
	TEST_REDIRECT,
	textOf,
	type LoginStep,
	type RunningHttp,
} from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from './config.ts'
import { ClientCache, hostedOptions, kaitenLogin } from './http.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'
import { publicUrlGuard, type UrlGuard } from './url-guard.ts'

const quiet = createLogger({ level: 'error', write: () => {} })
const base: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const kaiten = await fakeKaiten()
const failing = await fakeKaiten({ 'GET /users/current': () => ({ status: 500, headers: { 'retry-after': '0' } }) })
const moving = await fakeKaiten({
	'GET /users/current': () => ({ status: 302, headers: { location: 'http://169.254.169.254/' } }),
})
const running: RunningHttp[] = []
const publicDir = fakePages()

after(async () => {
	await Promise.all(running.map((r) => r.close()))
	await kaiten.close()
	await failing.close()
	await moving.close()
})

// Фейковый Kaiten живёт на http://127.0.0.1, настоящая проверка его не пустит.
const allowAll: UrlGuard = async () => {}

type StartOptions = { config?: Config; realGuard?: boolean; guard?: UrlGuard; logger?: Logger }

async function start({ config = base, realGuard = false, guard, logger = quiet }: StartOptions = {}): Promise<string> {
	const guardUrl = guard ?? (realGuard ? undefined : allowAll)

	const app = await startHttp((url) => {
		const http: HttpConfig = {
			port: 0,
			publicUrl: new URL(url),
			authSecret: 'x'.repeat(32),
			allowedRedirectUris: [],
		}

		return createHttpApp(hostedOptions({ config, logger, http, store: memoryStore(), guardUrl, publicDir })).app
	})

	running.push(app)

	return app.base
}

describe('удалённый коннектор', () => {
	test('вход токеном Kaiten доводит до инструмента, а сам токен из токена доступа не читается', async () => {
		const url = await start()
		const flow = await oauthFlow({
			base: url,
			login: submitForm({ kaiten_url: kaiten.apiUrl, kaiten_token: GOOD_TOKEN }),
		})
		const leaks = (token = '') =>
			token.includes(GOOD_TOKEN) ||
			token.split('.').some((part) => Buffer.from(part, 'base64url').toString().includes(GOOD_TOKEN))

		assert.ok(!leaks(flow.tokens.access_token), 'токен Kaiten виден в access-токене')
		assert.ok(flow.tokens.refresh_token, 'refresh-токен выдан')
		assert.ok(!leaks(flow.tokens.refresh_token), 'токен Kaiten виден в refresh-токене')

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
			login: submitForm({ kaiten_url: kaiten.apiUrl, kaiten_token: GOOD_TOKEN }),
		})
		const again = await flow.exchangeAgain()

		assert.equal(again.status, 400)
		assert.equal(((await again.json()) as { error: string }).error, 'invalid_grant')
	})

	test('неверный токен возвращает форму с ошибкой, а не выдаёт код', async () => {
		await assert.rejects(
			oauthFlow({ base: await start(), login: submitForm({ kaiten_url: kaiten.apiUrl, kaiten_token: 'bad' }) }),
			/Kaiten не узнал этот токен/,
		)
	})

	test('с KAITEN_API_URL адрес на форме не спрашивается', async () => {
		const config = { ...base, apiUrl: kaiten.apiUrl }
		const flow = await oauthFlow({
			base: await start({ config }),
			login: async (step) => {
				assert.equal(step.page, '/login')

				return submitForm({ kaiten_token: GOOD_TOKEN })(step)
			},
		})

		assert.ok(flow.tokens.access_token)
		// Страница статическая: поле адреса она прячет по этому флагу во фрагменте.
		assert.deepEqual(kaitenLogin(config, quiet).context, { kaitenUrl: 'fixed' })
		assert.equal(kaitenLogin(base, quiet).context, undefined)
	})

	test('адрес без Kaiten API -- так и сказано на форме', async () => {
		const wrong = kaiten.apiUrl.replace('/api/latest', '/nope')

		await assert.rejects(
			oauthFlow({ base: await start(), login: submitForm({ kaiten_url: wrong, kaiten_token: GOOD_TOKEN }) }),
			/нет Kaiten API/,
		)
	})

	test('мусор вместо адреса не доходит до запроса', async () => {
		await assert.rejects(
			oauthFlow({
				base: await start(),
				login: submitForm({ kaiten_url: 'https://exa mple', kaiten_token: GOOD_TOKEN }),
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
				login: submitForm({ kaiten_url: failing.apiUrl, kaiten_token: GOOD_TOKEN }),
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
			oauthFlow({
				base: await start(),
				login: submitForm({ kaiten_url: moving.apiUrl, kaiten_token: GOOD_TOKEN }),
			}),
			/отвечает редиректом/,
		)

		assert.equal(moving.requests.length, 1)
	})

	test('без KAITEN_API_URL форма не пускает на http и во внутреннюю сеть', async () => {
		const url = await start({ realGuard: true })
		const port = new URL(kaiten.apiUrl).port
		const login = (kaitenUrl: string) =>
			oauthFlow({ base: url, login: submitForm({ kaiten_url: kaitenUrl, kaiten_token: GOOD_TOKEN }) })
		const before = kaiten.requests.length

		await assert.rejects(login(kaiten.apiUrl), /должен начинаться с https/)
		await assert.rejects(login(`https://127.0.0.1:${port}`), /внутреннюю сеть/)
		await assert.rejects(login('https://localhost'), /внутреннюю сеть/)
		await assert.rejects(login('https://[::1]'), /внутреннюю сеть/)
		assert.equal(kaiten.requests.length, before)
	})

	test('лендинг из собранных страниц и /health', async () => {
		const url = await start()

		assert.match(await (await fetch(url)).text(), /page:index/)
		assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ok: true })
		assert.equal((await fetch(`${url}/mcp`, { method: 'POST', body: '{}' })).status, 401)
	})
})

/** Фрагмент адреса, куда сервер отправил браузер: страница входа читает из него контекст. */
const fragment = (location: string | null) => {
	const url = new URL(location ?? '', 'http://x')

	return { page: url.pathname, hash: Object.fromEntries(new URLSearchParams(url.hash.slice(1))) }
}

/** Регистрация и authorize, как у Claude: адрес страницы входа с фрагментом. */
async function authorizeLocation(url: string): Promise<string | null> {
	const registered = await fetch(`${url}/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'test',
			redirect_uris: [TEST_REDIRECT],
			token_endpoint_auth_method: 'none',
		}),
	})
	const { client_id } = (await registered.json()) as { client_id: string }
	const authorize = await fetch(
		`${url}/authorize?${new URLSearchParams({
			response_type: 'code',
			client_id,
			redirect_uri: TEST_REDIRECT,
			code_challenge: 'x'.repeat(43),
			code_challenge_method: 'S256',
		})}`,
		{ redirect: 'manual' },
	)

	assert.equal(authorize.status, 302)

	return authorize.headers.get('location')
}

/** Вход формой, который запоминает ответ колбэка: на отказ это редирект обратно на форму. */
function capturing(fields: Record<string, string>) {
	const seen: { response?: Response } = {}

	return {
		seen,
		login: async (step: LoginStep) => {
			seen.response = await submitForm(fields)(step)

			return seen.response
		},
	}
}

describe('форма входа', () => {
	test('неверный токен возвращает на форму с текстом ошибки и тем же запросом', async () => {
		const { seen, login } = capturing({ kaiten_url: kaiten.apiUrl, kaiten_token: 'bad' })

		await assert.rejects(oauthFlow({ base: await start(), login }))

		assert.equal(seen.response?.status, 303)

		const { page, hash } = fragment(seen.response.headers.get('location'))

		assert.equal(page, '/login')
		assert.equal(hash.error, 'Kaiten не узнал этот токен, проверь его и адрес')
		assert.ok(hash.request)
		assert.equal(hash.kaitenUrl, undefined)
	})

	test('с KAITEN_API_URL поле адреса скрыто флагом во фрагменте, и после ошибки тоже', async () => {
		const url = await start({ config: { ...base, apiUrl: kaiten.apiUrl } })

		assert.equal(fragment(await authorizeLocation(url)).hash.kaitenUrl, 'fixed')
		assert.equal(fragment(await authorizeLocation(await start())).hash.kaitenUrl, undefined)

		const { seen, login } = capturing({ kaiten_token: 'bad' })

		await assert.rejects(oauthFlow({ base: url, login }))
		assert.equal(fragment(seen.response?.headers.get('location') ?? null).hash.kaitenUrl, 'fixed')
	})

	test('с KAITEN_API_URL адрес из формы игнорируется', async () => {
		const before = moving.requests.length
		const flow = await oauthFlow({
			base: await start({ config: { ...base, apiUrl: kaiten.apiUrl } }),
			login: submitForm({ kaiten_url: moving.apiUrl, kaiten_token: GOOD_TOKEN }),
		})

		assert.ok(flow.tokens.access_token)
		assert.equal(moving.requests.length, before)
	})

	test('адрес из KAITEN_API_URL задал админ: проверка адреса к нему не применяется', async () => {
		const flow = await oauthFlow({
			base: await start({ config: { ...base, apiUrl: kaiten.apiUrl }, realGuard: true }),
			login: submitForm({ kaiten_token: GOOD_TOKEN }),
		})

		assert.ok(flow.tokens.access_token)
	})
})

describe('проверка адреса из формы после DNS', () => {
	// Резолвер подменён: имена ниже не резолвятся по-настоящему, наружу запросов нет.
	const resolve = async (host: string): Promise<string[]> => {
		const table: Record<string, string[]> = {
			'private.kaiten.test': ['10.0.0.7'],
			'office.kaiten.test': ['192.168.1.10'],
			'docker.kaiten.test': ['172.17.0.2'],
			'cgnat.kaiten.test': ['100.64.1.1'],
			'loopback.kaiten.test': ['127.0.0.1'],
			'link.kaiten.test': ['169.254.10.1'],
			'metadata.kaiten.test': ['169.254.169.254'],
			'aws6.kaiten.test': ['fd00:ec2::254'],
			'v6loop.kaiten.test': ['::1'],
			'v6link.kaiten.test': ['fe80::1'],
			'mapped.kaiten.test': ['::ffff:192.168.0.1'],
			'mixed.kaiten.test': ['93.184.216.34', '172.16.0.1'],
			'empty.kaiten.test': [],
			// Адрес-литерал 127.0.0.1 «резолвится» в публичный: так проверка пропускает его,
			// а запрос всё равно уходит на локальный фейк, не в сеть.
			'127.0.0.1': ['93.184.216.34'],
		}
		const addresses = table[host]

		if (!addresses) throw new Error(`ENOTFOUND ${host}`)

		return addresses
	}

	const login = (url: string, kaitenUrl: string) =>
		oauthFlow({ base: url, login: submitForm({ kaiten_url: kaitenUrl, kaiten_token: GOOD_TOKEN }) })

	test('частные сети, loopback, link-local и метаданные облаков отклоняются', async () => {
		const url = await start({ guard: publicUrlGuard(resolve) })

		for (const host of [
			'private',
			'office',
			'docker',
			'cgnat',
			'loopback',
			'link',
			'metadata',
			'aws6',
			'v6loop',
			'v6link',
			'mapped',
			'mixed',
			'empty',
		]) {
			await assert.rejects(login(url, `https://${host}.kaiten.test`), /внутреннюю сеть/, host)
		}

		await assert.rejects(login(url, 'https://nowhere.kaiten.test'), /Не нашёл хост nowhere\.kaiten\.test/)
		await assert.rejects(login(url, 'http://private.kaiten.test'), /должен начинаться с https/)
	})

	test('публичный https пропускается до запроса в Kaiten', async () => {
		const url = await start({ guard: publicUrlGuard(resolve) })
		const port = new URL(kaiten.apiUrl).port

		// Фейк говорит по http, TLS не сложится: важно, что отказ не от проверки адреса.
		await assert.rejects(login(url, `https://127.0.0.1:${port}`), /Не получилось достучаться до Kaiten/)
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
