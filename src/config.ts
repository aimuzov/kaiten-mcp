import { int, str, type Env } from '@aimuzov/infra-mcp-kit'
import type { LogLevel } from '@aimuzov/infra-mcp-kit'

export type Config = {
	/** База API. Может отсутствовать на старте: в stdio её спросят интерактивно, в HTTP её вводят при входе. */
	apiUrl?: string
	/** API-токен. Может отсутствовать на старте, как и `apiUrl`. */
	apiToken?: string
	defaultSpaceId?: number
	requestTimeoutMs: number
	maxConcurrentRequests: number
	logLevel: LogLevel
	logFile?: string
}

const LOG_LEVELS = new Set<string>(['error', 'warn', 'info', 'debug'])

/**
 * Принимает и `https://x.kaiten.ru`, и `x.kaiten.ru/api/latest`,
 * а отдаёт всегда адрес с `/api/latest` на конце и без хвостового слэша.
 */
export function normalizeApiUrl(raw: string): string {
	let url = raw.trim().replace(/\/+$/, '')

	if (!/^https?:\/\//i.test(url)) url = `https://${url}`

	if (!/\/api\/(latest|v\d+)$/i.test(url)) url = `${url}/api/latest`

	return url
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * Настройки из окружения. `KAITEN_API_URL` и `KAITEN_API_TOKEN` не обязательны:
 * без них stdio-сервер спросит креды через elicitation при первом обращении к API.
 */
export function loadConfig(env: Env = process.env): Config {
	const apiUrl = str(env, 'KAITEN_API_URL')
	const apiToken = str(env, 'KAITEN_API_TOKEN')
	const level = str(env, 'KAITEN_LOG_LEVEL', 'info').toLowerCase()
	const spaceId = str(env, 'KAITEN_DEFAULT_SPACE_ID')

	return {
		apiUrl: apiUrl ? normalizeApiUrl(apiUrl) : undefined,
		apiToken: apiToken || undefined,
		defaultSpaceId: /^\d+$/.test(spaceId) ? Number(spaceId) : undefined,
		requestTimeoutMs: clamp(int(env, 'KAITEN_REQUEST_TIMEOUT_MS', 30_000), 1000, 600_000),
		maxConcurrentRequests: clamp(int(env, 'KAITEN_MAX_CONCURRENT_REQUESTS', 5), 1, 20),
		logLevel: (LOG_LEVELS.has(level) ? level : 'info') as LogLevel,
		logFile: str(env, 'KAITEN_LOG_FILE') || undefined,
	}
}

/** Токен для логов: только края. */
export function redactToken(token: string): string {
	if (token.length <= 8) return '***'

	return `${token.slice(0, 4)}…${token.slice(-4)}`
}
