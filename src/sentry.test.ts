import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createLogger, McpServer } from '@aimuzov/infra-mcp-kit'
import * as Sentry from '@sentry/node'

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

test('ошибка инструмента уходит в Sentry с именем инструмента, но без аргументов', async () => {
	const events: Sentry.ErrorEvent[] = []

	assert.equal(
		initSentry(
			{ SENTRY_DSN: 'https://key@o0.ingest.sentry.io/0' },
			{
				beforeSend: (event: Sentry.ErrorEvent) => {
					events.push(event)

					return null
				},
			},
		),
		true,
	)

	const server = new McpServer({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } })
	const ctx: ToolContext = {
		server,
		logger: createLogger({ level: 'error', write: () => {} }),
		config: { requestTimeoutMs: 1, maxConcurrentRequests: 1, logLevel: 'error' },
		getClient: () => {
			throw new Error('Kaiten недоступен')
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

	assert.match(JSON.stringify(response), /Kaiten недоступен/)

	await Sentry.flush(1000)

	assert.equal(events.length, 1)

	const event = events[0]!

	assert.equal(event.exception?.values?.[0]?.value, 'Kaiten недоступен')
	assert.equal(event.tags?.['mcp.tool.name'], 'kaiten_boom')
	assert.equal(event.environment, 'production')
	assert.match(event.release ?? '', /^kaiten-mcp@\d+\.\d+\.\d+/)
	assert.doesNotMatch(JSON.stringify(event), /личное/)
})
