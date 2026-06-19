import { headers } from 'next/headers'

/** Публичный базовый URL сервиса (для OAuth metadata и redirect-проверок). */
export async function getBaseUrl(): Promise<string> {
	const h = await headers()
	const proto = h.get('x-forwarded-proto') ?? 'https'
	const host = h.get('x-forwarded-host') ?? h.get('host')
	if (!host) throw new Error('Не удалось определить host из заголовков')
	return `${proto}://${host}`
}

/** Секрет шифрования токенов. */
export function getAuthSecret(): string {
	const s = process.env.AUTH_SECRET
	if (!s || s.length < 16)
		throw new Error('AUTH_SECRET не задан или слишком короткий (минимум 16 символов)')
	return s
}

/** Опциональный единый Kaiten URL (если у всех один домен). */
export function getConfiguredKaitenUrl(): string | undefined {
	return process.env.KAITEN_API_URL?.trim() || undefined
}

/** Колбэки Claude по умолчанию (claude.ai / claude.com). */
const DEFAULT_ALLOWED_REDIRECTS = new Set([
	'https://claude.ai/api/mcp/auth_callback',
	'https://claude.com/api/mcp/auth_callback',
])

/**
 * Проверяет, разрешён ли redirect_uri. Защита от фишинга: без неё злоумышленник
 * мог бы подсунуть коллеге ссылку authorize с redirect_uri на свой домен и
 * перехватить выданный код (PKCE не спасает — challenge задаёт он сам).
 *
 * По умолчанию разрешены колбэки Claude и loopback (Claude Code на localhost с
 * произвольным портом). Список можно переопределить через ALLOWED_REDIRECT_URIS
 * (через запятую) — тогда допускаются только точные совпадения из него.
 */
export function isAllowedRedirectUri(redirectUri: string): boolean {
	const configured = process.env.ALLOWED_REDIRECT_URIS?.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	if (configured && configured.length > 0) {
		return configured.includes(redirectUri)
	}
	if (DEFAULT_ALLOWED_REDIRECTS.has(redirectUri)) return true
	try {
		const u = new URL(redirectUri)
		// Claude Code использует loopback-редирект на переменный порт.
		if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
			return true
		}
	} catch {
		return false
	}
	return false
}
