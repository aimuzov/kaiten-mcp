import { readVersion, type McpServer } from '@aimuzov/infra-mcp-kit'
import * as Sentry from '@sentry/node'

/**
 * Sentry включается только с `SENTRY_DSN`: он задан у коннектора на сервере, а у stdio
 * на машине человека и в разработке его нет, и SDK не стартует. Только ошибки, без
 * трейсинга. О пользователе SDK ничего не собирает: ни заголовки и тела запросов, ни query,
 * ни локальные переменные в стеке, где лежат аргументы инструментов и токены.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env, options: Sentry.NodeOptions = {}): boolean {
	if (!env.SENTRY_DSN) return false

	Sentry.init({
		dsn: env.SENTRY_DSN,
		environment: 'production',
		release: `kaiten-mcp@${readVersion(import.meta.url)}`,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			stackFrameVariables: false,
		},
		beforeBreadcrumb: stripQuery,
		...options,
	})

	return true
}

/**
 * У запросов к Kaiten в query бывает текст поиска. `urlQueryParams` его фильтрует,
 * но в хлебных крошках адрес надёжнее обрезать самим.
 */
export function stripQuery(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
	const url = breadcrumb.data?.url

	if (typeof url === 'string') breadcrumb.data = { ...breadcrumb.data, url: url.split('?')[0] }

	return breadcrumb
}

/**
 * Метит вызовы инструментов их именем: ошибка из `run` попадёт в Sentry с тегом
 * `mcp.tool.name`, а сам `run` имени не знает.
 */
export function tagToolCalls(server: McpServer): void {
	const register = server.registerTool.bind(server) as (
		name: string,
		config: unknown,
		handler: (...args: unknown[]) => unknown,
	) => void

	server.registerTool = ((name: string, config: unknown, handler: (...args: unknown[]) => unknown) =>
		register(name, config, (...args) =>
			Sentry.withScope((scope) => {
				scope.setTag('mcp.tool.name', name)

				return handler(...args)
			}),
		)) as McpServer['registerTool']
}
