import { str, type Env } from '@aimuzov/infra-mcp-kit'
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

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug']

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

/** Целое из окружения: пусто -- `undefined`, мусор и выход за рамки -- ошибка. */
function intIn(env: Env, name: string, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
	const raw = str(env, name)

	if (!raw) return undefined

	const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN

	if (!(value >= min && value <= max)) {
		const range = max === Number.MAX_SAFE_INTEGER ? `от ${min}` : `от ${min} до ${max}`

		throw new Error(`${name}: нужно целое ${range}, а задано "${raw}"`)
	}

	return value
}

function logLevel(env: Env): LogLevel {
	const raw = str(env, 'KAITEN_LOG_LEVEL', 'info')
	const level = LOG_LEVELS.find((known) => known === raw.toLowerCase())

	if (!level) throw new Error(`KAITEN_LOG_LEVEL: нужно одно из ${LOG_LEVELS.join(', ')}, а задано "${raw}"`)

	return level
}

/**
 * Настройки из окружения. `KAITEN_API_URL` и `KAITEN_API_TOKEN` не обязательны:
 * без них stdio-сервер спросит креды через elicitation при первом обращении к API.
 * Пустая переменная берёт значение по умолчанию, мусор в ней -- ошибка запуска.
 */
export function loadConfig(env: Env = process.env): Config {
	const apiUrl = str(env, 'KAITEN_API_URL')
	const apiToken = str(env, 'KAITEN_API_TOKEN')

	return {
		apiUrl: apiUrl ? normalizeApiUrl(apiUrl) : undefined,
		apiToken: apiToken || undefined,
		defaultSpaceId: intIn(env, 'KAITEN_DEFAULT_SPACE_ID', 1),
		requestTimeoutMs: intIn(env, 'KAITEN_REQUEST_TIMEOUT_MS', 1000, 600_000) ?? 30_000,
		maxConcurrentRequests: intIn(env, 'KAITEN_MAX_CONCURRENT_REQUESTS', 1, 20) ?? 5,
		logLevel: logLevel(env),
		logFile: str(env, 'KAITEN_LOG_FILE') || undefined,
	}
}

/** Токен для логов: только края. */
export function redactToken(token: string): string {
	if (token.length <= 8) return '***'

	return `${token.slice(0, 4)}…${token.slice(-4)}`
}
