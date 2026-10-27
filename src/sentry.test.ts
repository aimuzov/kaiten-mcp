import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createLogger, McpServer } from '@aimuzov/infra-mcp-kit'
import * as Sentry from '@sentry/node'

import { KaitenApiError } from './kaiten-client.ts'
import { initSentry, stripQuery, tagToolCalls } from './sentry.ts'
import { run, type ToolContext } from './tools/helpers.ts'

after(() => Sentry.close())

test('initSentry без SENTRY_DSN не включает SDK', () => {
	assert.equal(initSentry({}), false)
	assert.equal(Sentry.getClient(), undefined)
})

test('stripQuery обрезает query у адреса в хлебной крошке', () => {
	assert.deepEqual(
		stripQuery({ data: { url: 'https://x.kaiten.ru/api/latest/search?query=secret', method: 'GET' } }),
		{
			data: { url: 'https://x.kaiten.ru/api/latest/search', method: 'GET' },
		},
	)

	assert.deepEqual(stripQuery({ message: 'no url' }), { message: 'no url' })
})

test('ошибка инструмента уходит в Sentry с именем инструмента, но без аргументов и текста Kaiten', async () => {
	const events: Sentry.ErrorEvent[] = []
	// Свой транспорт вместо сети, чтобы `beforeSend` из initSentry остался в силе.
	const transport: Sentry.NodeOptions['transport'] = () => ({
		send: async (envelope: [unknown, [{ type?: string }, unknown][]]) => {
			for (const [header, payload] of envelope[1]) {
				if (header.type === 'event') events.push(payload as Sentry.ErrorEvent)
			}

			return {}
		},
		flush: async () => true,
	})

	assert.equal(initSentry({ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' }, { transport }), true)

	const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } })
	const ctx: ToolContext = {
		server,
		logger: createLogger({ level: 'error', write: () => {} }),
		config: { requestTimeoutMs: 1, maxConcurrentRequests: 1, logLevel: 'error' },
		getClient: () => {
			throw new KaitenApiError(
				'Kaiten API POST /cards failed (HTTP 400): личное',
				400,
				{},
				'Kaiten API POST /cards failed (HTTP 400)',
			)
		},
	}

	tagToolCalls(server)
	server.registerTool('kaiten_boom', { inputSchema: {} }, (_args, extra) => run(ctx, extra, async () => null))

	const response = await server.receive({
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: 'kaiten_boom', arguments: { title: 'личное' } },
	})

	assert.match(JSON.stringify(response), /HTTP 400\): личное/)

	await Sentry.flush(1000)

	assert.equal(events.length, 1)

	const event = events[0]!

	assert.equal(event.exception?.values?.[0]?.value, 'Kaiten API POST /cards failed (HTTP 400)')
	assert.equal(event.tags?.['mcp.tool.name'], 'kaiten_boom')
	assert.equal(event.environment, 'production')
	assert.match(event.release ?? '', /^kaiten-mcp@\d+\.\d+\.\d+/)
	// В стеке строки исходника этого теста, где "личное" написано руками, их не смотрим.
	const withoutStack = JSON.stringify(event, (key, value: unknown) => (key === 'stacktrace' ? undefined : value))

	assert.doesNotMatch(withoutStack, /личное/)
})
