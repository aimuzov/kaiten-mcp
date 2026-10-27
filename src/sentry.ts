import { readVersion, type McpServer } from '@aimuzov/infra-mcp-kit'
import * as Sentry from '@sentry/node'

import { KaitenApiError } from './kaiten-client.ts'

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
		// Без нуля SDK взял бы SENTRY_TRACES_SAMPLE_RATE из окружения.
		tracesSampleRate: 0,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			stackFrameVariables: false,
		},
		// Без сессий процесса и запросов и без отчётов SDK о себе: их он шлёт и без ошибок.
		sendClientReports: false,
		integrations: <T extends { name: string }>(defaults: T[]) => [
			...defaults.filter(({ name }) => name !== 'ProcessSession' && name !== 'Http'),
			Sentry.httpIntegration({ sessions: false }),
		],
		beforeSend: hideKaitenDetail,
		beforeBreadcrumb: stripQuery,
		...options,
	})

	return true
}

/** Модели ошибка Kaiten уходит целиком, а в Sentry -- без текста из ответа. */
export function hideKaitenDetail(event: Sentry.ErrorEvent, hint: Sentry.EventHint): Sentry.ErrorEvent {
	const error = hint.originalException
	const exception = event.exception?.values?.at(-1)

	if (error instanceof KaitenApiError && exception) exception.value = error.summary

	return event
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
			Sentry.withScope((scope: Sentry.Scope) => {
				scope.setTag('mcp.tool.name', name)

				return handler(...args)
			}),
		)) as McpServer['registerTool']
}
