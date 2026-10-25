import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { after, describe, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { connectInMemory } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { KaitenClient } from './kaiten-client.ts'
import { createServer, createStdioServer, NAME, VERSION } from './server.ts'
import { fakeKaiten, GOOD_TOKEN } from './testing/fake-kaiten.ts'

/**
 * Контракт протокола глазами клиента: что отдают `initialize` и `tools/list` и как выглядят
 * ответы `tools/call`. Тест не знает про SDK сервера, поэтому переживёт его смену и поймает
 * всё, что при ней поменялось для клиента.
 *
 * Обновить фикстуру после намеренной правки инструментов:
 * `UPDATE_CONTRACT=1 npm test && npx prettier --write src/contract.fixture.json`.
 */
const FIXTURE = new URL('contract.fixture.json', import.meta.url)

const quiet = createLogger({ level: 'error', write: () => {} })
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const kaiten = await fakeKaiten({ 'GET /cards/5': () => ({ body: { id: 5, title: 'Карточка', tags: [] } }) })

after(() => kaiten.close())

const credentials = () => new CredentialsProvider({ apiUrl: kaiten.apiUrl, apiToken: GOOD_TOKEN }, quiet)
const stdio = await connectInMemory(createStdioServer(config, credentials(), quiet))
const client = new KaitenClient(config, credentials(), quiet)
const hosted = await connectInMemory(createServer({ config, logger: quiet, resolveClient: () => client }))

type Tool = Awaited<ReturnType<typeof stdio.listTools>>['tools'][number]

/**
 * Инструмент без полей, которые добавляет сам SDK: `execution`, `_meta` и `$schema`
 * в схеме входа. Клиенты по ним не работают, а при смене SDK они меняются первыми.
 */
const contractOf = ({ name, title, description, inputSchema, annotations }: Tool) => {
	const { $schema: _, ...schema } = inputSchema as Record<string, unknown>

	return { name, title, description, inputSchema: schema, ...(annotations ? { annotations } : {}) }
}

async function snapshot() {
	const { tools } = await stdio.listTools()

	return {
		server: {
			name: stdio.getServerVersion()?.name,
			stdioInstructions: stdio.getInstructions(),
			hostedInstructions: hosted.getInstructions(),
		},
		tools: tools.map(contractOf).toSorted((a, b) => a.name.localeCompare(b.name)),
	}
}

describe('контракт протокола', () => {
	test('initialize и tools/list совпадают с фикстурой', async () => {
		const actual = await snapshot()

		if (process.env.UPDATE_CONTRACT) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, '\t')}\n`)

		assert.deepEqual(actual, JSON.parse(readFileSync(FIXTURE, 'utf8')))
	})

	test('сервер представляется своим именем и версией пакета и объявляет инструменты', () => {
		assert.deepEqual(stdio.getServerVersion(), { name: NAME, version: VERSION })
		assert.equal(NAME, 'kaiten-mcp')
		assert.ok(stdio.getServerCapabilities()?.tools)
	})

	test('успех: один текстовый блок с JSON ответа Kaiten, без structuredContent и isError', async () => {
		const result = await stdio.callTool({ name: 'kaiten_get_card', arguments: { card_id: 5 } })

		assert.deepEqual(result, {
			content: [{ type: 'text', text: JSON.stringify({ id: 5, title: 'Карточка', tags: [] }, null, 2) }],
		})
	})

	test('ошибка инструмента: текст ошибки и isError, а не ошибка JSON-RPC', async () => {
		const result = await stdio.callTool({ name: 'kaiten_get_card', arguments: { card_id: 404 } })

		assert.deepEqual(result, {
			content: [{ type: 'text', text: 'Kaiten API GET /cards/404 failed (HTTP 404): Not found' }],
			isError: true,
		})
	})

	test('неверные аргументы: ответ с isError и именем поля, в Kaiten ничего не уходит', async () => {
		const before = kaiten.requests.length

		for (const args of [{ card_id: 'пять' }, {}, { card_id: 1.5 }]) {
			const result = await stdio.callTool({ name: 'kaiten_get_card', arguments: args })

			assert.deepEqual(Object.keys(result).sort(), ['content', 'isError'], JSON.stringify(args))
			assert.equal(result.isError, true)

			const content = result.content as { type: string; text: string }[]

			assert.equal(content.length, 1)
			assert.equal(content[0]?.type, 'text')
			assert.match(content[0]?.text ?? '', /card_id/)
		}

		assert.equal(kaiten.requests.length, before)
	})

	test('неизвестный инструмент: ответ с isError и его именем', async () => {
		const result = await stdio.callTool({ name: 'kaiten_nope', arguments: {} })

		assert.equal(result.isError, true)
		assert.match((result.content as { text: string }[])[0]?.text ?? '', /kaiten_nope/)
	})
})
