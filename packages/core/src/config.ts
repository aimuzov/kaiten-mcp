import type { LogLevel } from './logger.js'

export interface Config {
	/** База API. Может отсутствовать на старте — тогда запрашивается интерактивно (elicitation). */
	apiUrl?: string
	/** API-токен. Может отсутствовать на старте — тогда запрашивается интерактивно (elicitation). */
	apiToken?: string
	defaultSpaceId?: number
	requestTimeoutMs: number
	maxConcurrentRequests: number
	logLevel: LogLevel
	logFilePath?: string
}

const VALID_LOG_LEVELS = new Set<LogLevel>(['error', 'warn', 'info', 'debug'])

/**
 * Нормализует базовый URL Kaiten API.
 * Принимает как "https://x.kaiten.ru", так и "https://x.kaiten.ru/api/latest"
 * и всегда возвращает вариант, оканчивающийся на "/api/latest" без хвостового слэша.
 */
export function normalizeApiUrl(raw: string): string {
	let url = raw.trim().replace(/\/+$/, '')
	if (!/^https?:\/\//i.test(url)) {
		url = 'https://' + url
	}
	if (!/\/api\/(latest|v\d+)$/i.test(url)) {
		url = url + '/api/latest'
	}
	return url
}

function parseIntEnv(value: string | undefined, fallback: number): number {
	if (value === undefined || value.trim() === '') return fallback
	const n = Number.parseInt(value, 10)
	return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n))
}

/**
 * Читает конфигурацию из переменных окружения.
 *
 * KAITEN_API_URL и KAITEN_API_TOKEN НЕ обязательны на старте: если их нет,
 * сервер запросит их интерактивно у пользователя при первом обращении к API
 * (через механизм elicitation MCP), а при отсутствии поддержки — вернёт
 * понятную ошибку с просьбой задать переменные окружения.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const apiUrlRaw = env.KAITEN_API_URL?.trim()
	const apiToken = env.KAITEN_API_TOKEN?.trim()

	const logLevelRaw = (env.KAITEN_LOG_LEVEL?.trim().toLowerCase() ?? 'info') as LogLevel
	const logLevel = VALID_LOG_LEVELS.has(logLevelRaw) ? logLevelRaw : 'info'

	const defaultSpaceIdRaw = env.KAITEN_DEFAULT_SPACE_ID?.trim()
	const defaultSpaceId =
		defaultSpaceIdRaw && /^\d+$/.test(defaultSpaceIdRaw)
			? Number.parseInt(defaultSpaceIdRaw, 10)
			: undefined

	return {
		apiUrl: apiUrlRaw ? normalizeApiUrl(apiUrlRaw) : undefined,
		apiToken: apiToken || undefined,
		defaultSpaceId,
		requestTimeoutMs: clamp(parseIntEnv(env.KAITEN_REQUEST_TIMEOUT_MS, 30000), 1000, 600000),
		maxConcurrentRequests: clamp(parseIntEnv(env.KAITEN_MAX_CONCURRENT_REQUESTS, 5), 1, 20),
		logLevel,
		logFilePath: env.KAITEN_LOG_FILE?.trim() || undefined,
	}
}

/** Маскирует токен для безопасного логирования. */
export function redactToken(token: string): string {
	if (token.length <= 8) return '***'
	return `${token.slice(0, 4)}…${token.slice(-4)}`
}
