import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'

export const GOOD_TOKEN = 'good-token'

export type FakeRequest = { method: string; url: string; auth?: string; body: string }

export type Answer = {
	status?: number
	body?: unknown
	/** Тело как есть, не JSON: HTML от прокси и подобное. */
	raw?: string
	headers?: Record<string, string>
}

/** Ответ на запрос. Промис -- для медленного Kaiten: таймаутов и лимита параллельных запросов. */
export type Route = (req: FakeRequest) => Answer | Promise<Answer>

export type FakeKaiten = {
	/** Адрес API, как его отдаёт `normalizeApiUrl`. */
	apiUrl: string
	requests: FakeRequest[]
	close(): Promise<void>
}

const read = async (req: IncomingMessage) => {
	let body = ''

	for await (const chunk of req) body += chunk

	return body
}

/**
 * Kaiten на 127.0.0.1: принимает только `GOOD_TOKEN`, на `/users/current` отвечает
 * пользователем 7, остальное -- по `routes` с ключом `METHOD /путь`.
 */
export async function fakeKaiten(routes: Record<string, Route> = {}): Promise<FakeKaiten> {
	const requests: FakeRequest[] = []
	const server = createServer(async (req, res) => {
		const request = {
			method: req.method ?? '',
			url: req.url ?? '',
			auth: req.headers.authorization,
			body: await read(req),
		}

		requests.push(request)

		if (request.auth !== `Bearer ${GOOD_TOKEN}`) {
			return void res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"Unauthorized"}')
		}

		const path = new URL(request.url, 'http://x').pathname.replace(/^\/api\/latest/, '')
		const route = routes[`${request.method} ${path}`]
		const answer = route
			? await route(request)
			: path === '/users/current'
				? { body: { id: 7, full_name: 'Тест Тестов' } }
				: { status: 404, body: { message: 'Not found' } }

		res.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...answer.headers })
		res.end(answer.raw ?? (answer.body === undefined ? '' : JSON.stringify(answer.body)))
	})

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

	return {
		apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/latest`,
		requests,
		close: () =>
			new Promise((resolve) => {
				server.closeAllConnections()
				server.close(() => resolve())
			}),
	}
}
