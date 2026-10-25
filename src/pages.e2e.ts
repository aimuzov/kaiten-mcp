/**
 * Страницы kaiten на настоящей сборке Astro: вход в Chromium через статическую `/login`
 * до кода у клиента, поле адреса с KAITEN_API_URL и без, ошибка входа на форме,
 * скриншоты в обеих темах. CSP режет инлайн-код молча, поэтому любое
 * "Refused to" в консоли -- провал. Перед запуском нужен `npm run build`,
 * это делает `npm run test:ui`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { createHttpApp, memoryStore } from '@aimuzov/infra-mcp-kit/http'
import { startHttp, type RunningHttp } from '@aimuzov/infra-mcp-kit/testing'
import { chromium, type Browser, type Page } from 'playwright'

import type { Config } from './config.ts'
import { hostedOptions, PUBLIC_DIR } from './http.ts'
import { fakeKaiten, GOOD_TOKEN, type FakeKaiten } from './testing/fake-kaiten.ts'

const SHOTS = fileURLToPath(new URL('../test-results/screens', import.meta.url))
const CLIENT_REDIRECT = 'http://127.0.0.1:9/cb'
const quiet = createLogger({ level: 'error', write: () => {} })
const base: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }

let kaiten: FakeKaiten
let browser: Browser
const running: RunningHttp[] = []
const problems: string[] = []

before(async () => {
	assert.ok(existsSync(join(PUBLIC_DIR, 'login.html')), 'страницы не собраны: сначала npm run build')

	kaiten = await fakeKaiten()
	browser = await chromium.launch()
	mkdirSync(SHOTS, { recursive: true })
})

after(async () => {
	await browser?.close()
	await Promise.all(running.map((r) => r.close()))
	await kaiten?.close()
})

/** Коннектор на собранных страницах. Kaiten на 127.0.0.1, поэтому проверка адреса своя. */
async function start(config: Config = base): Promise<string> {
	const app = await startHttp((url) =>
		createHttpApp(
			hostedOptions({
				config,
				logger: quiet,
				http: { port: 0, publicUrl: new URL(url), authSecret: 'x'.repeat(32), allowedRedirectUris: [] },
				store: memoryStore(),
				guardUrl: async () => {},
			}),
		),
	)

	running.push(app)

	return app.base
}

/** Регистрация и `/authorize`, как у Claude: адрес входа с контекстом во фрагменте. */
async function authorize(url: string): Promise<string> {
	const reg = await fetch(`${url}/register`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Claude',
			redirect_uris: [CLIENT_REDIRECT],
			token_endpoint_auth_method: 'none',
		}),
	})
	const { client_id } = (await reg.json()) as { client_id: string }
	const res = await fetch(
		`${url}/authorize?${new URLSearchParams({
			response_type: 'code',
			client_id,
			redirect_uri: CLIENT_REDIRECT,
			code_challenge: 'x'.repeat(43),
			code_challenge_method: 'S256',
			state: 'st',
		})}`,
		{ redirect: 'manual' },
	)

	assert.equal(res.status, 302)

	return new URL(res.headers.get('location') ?? '', url).href
}

type OpenOptions = { scheme?: 'light' | 'dark'; width?: number }

async function open(href: string, { scheme = 'light', width = 1280 }: OpenOptions = {}): Promise<Page> {
	const context = await browser.newContext({
		viewport: { width, height: width < 600 ? 844 : 900 },
		colorScheme: scheme,
		deviceScaleFactor: 2,
	})
	const page = await context.newPage()

	page.on('console', (m) => {
		if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`${href}: ${m.text()}`)
	})

	page.on('pageerror', (e) => problems.push(`${href}: ${e.message}`))

	await page.goto(href)

	return page
}

/** Остров формы гидрирован: кнопка становится активной, когда прочитан контекст. */
const hydrated = (page: Page) => page.locator('button[type=submit]:not([disabled])').waitFor()

describe('страницы kaiten', () => {
	test('вход формой доходит до кода у клиента', async () => {
		const page = await open(await authorize(await start()))

		await hydrated(page)

		// Колбэк клиента приходит редиректом после POST формы, а `page.route` цели редиректа
		// не перехватывает. Ловим сам запрос: порт 9 закрыт, ответа ждать нечего.
		const redirected = page.waitForRequest((request) => request.url().startsWith(CLIENT_REDIRECT))

		await page.fill('input[name=kaiten_url]', kaiten.apiUrl)
		await page.fill('input[name=kaiten_token]', GOOD_TOKEN)
		await page.click('button[type=submit]')

		const url = new URL((await redirected).url())

		assert.ok(url.searchParams.get('code'))
		assert.equal(url.searchParams.get('state'), 'st')
		await page.context().close()
	})

	test('неверный токен возвращает на форму с текстом ошибки', async () => {
		const page = await open(await authorize(await start()))

		await hydrated(page)
		await page.fill('input[name=kaiten_url]', kaiten.apiUrl)
		await page.fill('input[name=kaiten_token]', 'bad')
		await page.click('button[type=submit]')
		await page.getByText('Kaiten не узнал этот токен').waitFor()
		await page.screenshot({ path: join(SHOTS, 'login-error-light.png'), fullPage: true })
		await page.context().close()
	})

	test('с KAITEN_API_URL поля адреса на странице нет', async () => {
		const page = await open(await authorize(await start({ ...base, apiUrl: kaiten.apiUrl })))

		await hydrated(page)
		assert.equal(await page.locator('input[name=kaiten_url]').count(), 0)
		assert.equal(await page.locator('input[name=kaiten_token]').count(), 1)
		await page.screenshot({ path: join(SHOTS, 'login-fixed-url-light.png'), fullPage: true })
		await page.context().close()
	})

	test('скриншоты лендинга и входа в обеих темах, на телефоне и десктопе', async () => {
		const url = await start()

		for (const scheme of ['light', 'dark'] as const) {
			for (const width of [1280, 390]) {
				const size = width < 600 ? 'mobile' : 'desktop'
				const landing = await open(url, { scheme, width })

				await landing.screenshot({ path: join(SHOTS, `landing-${scheme}-${size}.png`), fullPage: true })
				await landing.context().close()

				const login = await open(await authorize(url), { scheme, width })

				await hydrated(login)
				await login.screenshot({ path: join(SHOTS, `login-${scheme}-${size}.png`), fullPage: true })
				await login.context().close()
			}
		}
	})

	test('ни одна страница не нарушила CSP и не упала в JS', () => {
		assert.deepEqual(problems, [])
	})
})
