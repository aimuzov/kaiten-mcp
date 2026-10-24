import { readVersion, type Logger } from '@aimuzov/infra-mcp-kit'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { Config } from './config.ts'
import type { CredentialElicitor, CredentialsProvider } from './credentials.ts'
import { KaitenClient } from './kaiten-client.ts'
import type { ToolExtra } from './tools/helpers.ts'
import { registerAllTools } from './tools/index.ts'

export const NAME = 'kaiten-mcp'
export const VERSION = readVersion(import.meta.url)

const INSTRUCTIONS =
	'MCP-сервер для Kaiten. Используйте инструменты kaiten_* для управления ' +
	'пространствами, досками, карточками, комментариями и для планирования задач. ' +
	'Для планировочных инструментов (kaiten_today_tasks, kaiten_plan_day) можно не ' +
	'указывать user_id — будет использован текущий пользователь токена.'

const ELICIT_HINT =
	' Если учётные данные Kaiten не заданы, сервер запросит их у пользователя при первом обращении к API.'

export type ServerOptions = {
	config: Config
	logger: Logger
	/** Клиент Kaiten для вызова инструмента. */
	resolveClient(extra: ToolExtra): KaitenClient
}

export function createServer({ config, logger, resolveClient }: ServerOptions, instructions = INSTRUCTIONS): McpServer {
	const server = new McpServer({ name: NAME, version: VERSION }, { capabilities: { tools: {} }, instructions })

	registerAllTools({ server, logger, config, getClient: resolveClient })

	return server
}

/**
 * Локальный сервер: один клиент Kaiten на процесс, а недостающие креды спрашиваются
 * у человека через elicitation, если клиент её умеет.
 */
export function createStdioServer(config: Config, credentials: CredentialsProvider, logger: Logger): McpServer {
	const client = new KaitenClient(config, credentials, logger)
	const server = createServer({ config, logger, resolveClient: () => client }, INSTRUCTIONS + ELICIT_HINT)

	credentials.setElicitor(elicitor(server, logger))

	return server
}

type StringField = { type: 'string'; title?: string; description?: string; minLength?: number }

function elicitor(server: McpServer, logger: Logger): CredentialElicitor {
	return async (need) => {
		if (!server.server.getClientCapabilities()?.elicitation) {
			logger.warn('Клиент не поддерживает elicitation — интерактивный запрос недоступен')

			return null
		}

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
				description: 'Персональный API-токен (профиль → API-ключи). Хранится только в памяти на время сессии.',
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

		if (result.action !== 'accept' || !result.content) return null

		const { api_url: url, api_token: token } = result.content

		return {
			api_url: typeof url === 'string' ? url : undefined,
			api_token: typeof token === 'string' ? token : undefined,
		}
	}
}
