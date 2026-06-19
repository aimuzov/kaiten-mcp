#!/usr/bin/env node
import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	loadConfig,
	CredentialsProvider,
	KaitenClient,
	Logger,
	makeToolContext,
	registerAllTools,
} from '@aimuzov/kaiten-mcp-core'

const require = createRequire(import.meta.url)
const { version: SERVER_VERSION } = require('../package.json') as { version: string }

const SERVER_NAME = 'kaiten-mcp'

async function main(): Promise<void> {
	// Подхватываем .env, если он есть рядом (поддержка появилась в Node 20.12+/22).
	// Переменные, переданные через конфиг MCP, имеют приоритет и не перезаписываются.
	const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile
	if (typeof loadEnvFile === 'function') {
		try {
			loadEnvFile()
		} catch {
			// .env отсутствует — это нормально.
		}
	}

	const config = loadConfig()
	const logger = new Logger({ level: config.logLevel, filePath: config.logFilePath })

	const credentials = new CredentialsProvider(
		{ apiUrl: config.apiUrl, apiToken: config.apiToken },
		logger,
	)
	const client = new KaitenClient(config, credentials, logger)

	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			capabilities: { tools: {} },
			instructions:
				'MCP-сервер для Kaiten. Используйте инструменты kaiten_* для управления ' +
				'пространствами, досками, карточками, комментариями и для планирования задач. ' +
				'Для планировочных инструментов (kaiten_today_tasks, kaiten_plan_day) можно не ' +
				'указывать user_id — будет использован текущий пользователь токена. ' +
				'Если учётные данные Kaiten не заданы, сервер запросит их у пользователя ' +
				'при первом обращении к API.',
		},
	)

	// Интерактивный запрос недостающих кредов через elicitation.
	// Работает только если клиент объявил поддержку elicitation; иначе — фолбэк
	// на env с понятной ошибкой при вызове инструмента.
	credentials.setElicitor(async (need) => {
		const capabilities = server.server.getClientCapabilities()
		if (!capabilities?.elicitation) {
			logger.warn('Клиент не поддерживает elicitation — интерактивный запрос недоступен')
			return null
		}

		type StringField = { type: 'string'; title?: string; description?: string; minLength?: number }
		const properties: Record<string, StringField> = {}
		const required: string[] = []
		if (need.url) {
			properties.api_url = {
				type: 'string',
				title: 'Kaiten URL',
				description: 'Адрес вашего Kaiten, напр. https://your-domain.kaiten.ru',
				minLength: 1,
			}
			required.push('api_url')
		}
		if (need.token) {
			properties.api_token = {
				type: 'string',
				title: 'Kaiten API-токен',
				description:
					'Персональный API-токен (профиль → API-ключи). Хранится только в памяти на время сессии.',
				minLength: 1,
			}
			required.push('api_token')
		}

		const result = await server.server.elicitInput({
			message:
				'Для доступа к Kaiten нужны учётные данные. Введите их — они сохранятся ' +
				'только на время текущей сессии сервера и не записываются на диск.',
			requestedSchema: { type: 'object', properties, required },
		})

		if (result.action !== 'accept' || !result.content) {
			return null
		}
		const content = result.content
		return {
			api_url: typeof content.api_url === 'string' ? content.api_url : undefined,
			api_token: typeof content.api_token === 'string' ? content.api_token : undefined,
		}
	})

	const ctx = makeToolContext({ server, logger, config, resolveClient: () => client })
	registerAllTools(ctx)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	logger.info(`${SERVER_NAME} v${SERVER_VERSION} запущен (stdio)`, {
		credentials: credentials.hasCredentials ? 'из окружения' : 'будут запрошены интерактивно',
	})
}

main().catch((err: unknown) => {
	const message = err instanceof Error ? err.message : String(err)
	process.stderr.write(`[kaiten-mcp] Fatal: ${message}\n`)
	process.exit(1)
})
