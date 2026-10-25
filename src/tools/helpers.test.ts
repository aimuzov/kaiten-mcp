import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'

import type { KaitenClient } from '#kaiten/kaiten-client'

import { compact, normalizeMultiline, run, type ToolContext } from './helpers.ts'

test('compact убирает undefined, но оставляет null, чтобы PATCH мог сбросить поле', () => {
	assert.deepEqual(compact({ a: 1, b: undefined }), { a: 1 })
	assert.deepEqual(compact({ due_date: null, title: 'x', skip: undefined }), { due_date: null, title: 'x' })
	assert.deepEqual(compact({ a: 0, b: '', c: false }), { a: 0, b: '', c: false })
})

test('normalizeMultiline раскрывает литералы \\n, \\r\\n и \\t', () => {
	assert.equal(normalizeMultiline('a\\nb'), 'a\nb')
	assert.equal(normalizeMultiline('a\\r\\nb\\tc'), 'a\nb\tc')
	assert.equal(normalizeMultiline('a\nb'), 'a\nb')
	assert.equal(normalizeMultiline(undefined), undefined)
	assert.equal(normalizeMultiline(42), 42)
})

const quiet = createLogger({ level: 'error', write: () => {} })

const context = (getClient: ToolContext['getClient']): ToolContext => ({
	server: {} as never,
	logger: quiet,
	config: { requestTimeoutMs: 1, maxConcurrentRequests: 1, logLevel: 'error' },
	getClient,
})

test('run берёт клиента по extra и отдаёт ответ JSON-текстом без structuredContent', async () => {
	const fake = { marker: 1 } as unknown as KaitenClient
	const result = await run(
		context((extra) => {
			assert.deepEqual(extra, { tag: 'abc' })

			return fake
		}),
		{ tag: 'abc' },
		async (client) => ({ same: client === fake }),
	)

	assert.equal(result.isError, undefined)
	assert.equal(result.structuredContent, undefined)
	assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), { same: true })
})

test('run превращает исключение в ответ с isError', async () => {
	const result = await run(
		context(() => {
			throw new Error('нет кредов')
		}),
		undefined,
		async () => null,
	)

	assert.equal(result.isError, true)
	assert.match((result.content[0] as { text: string }).text, /нет кредов/)
})
