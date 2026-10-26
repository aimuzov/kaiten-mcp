import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDir, type AuthInfo, type Env, type Logger } from '@aimuzov/infra-mcp-kit'
import {
	loadHttpConfig,
	LoginError,
	serveHttp,
	sqliteStore,
	tokenFormLogin,
	type AuthStore,
	type HttpAppOptions,
	type HttpConfig,
	type Login,
} from '@aimuzov/infra-mcp-kit/http'

import { normalizeApiUrl, type Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { KaitenApiError, KaitenClient } from './kaiten-client.ts'
import { createServer, NAME } from './server.ts'
import { publicUrlGuard, UnsafeUrlError, type UrlGuard } from './url-guard.ts'

/**
 * Страницы, которые собрал `astro build`. Путь один и из `src`, и из `build`:
 * `src/http.ts` и `build/http.js` лежат на одной глубине.
 */
export const PUBLIC_DIR = fileURLToPath(new URL('../build/public', import.meta.url))

/**
 * Клиенты Kaiten по паре адрес и токен. Клиент держит семафор на токен, поэтому один
 * пользователь не забьёт пул запросами из нескольких сессий. Размер ограничен:
 * процесс живёт долго, а токены меняются.
 */
export class ClientCache {
	private readonly clients = new Map<string, KaitenClient>()
	private readonly config: Config
	private readonly logger: Logger
	private readonly max: number
	private readonly guardUrl?: UrlGuard

	constructor(config: Config, logger: Logger, { max = 500, guardUrl }: { max?: number; guardUrl?: UrlGuard } = {}) {
		this.config = config
		this.logger = logger
		this.max = max
		this.guardUrl = guardUrl
	}

	get size(): number {
		return this.clients.size
	}

	get(apiUrl: string, apiToken: string): KaitenClient {
		const key = JSON.stringify([apiUrl, apiToken])
		let client = this.clients.get(key)

		if (client) {
			// Map помнит порядок вставки: переставляем в конец, чтобы вытеснялся давно не нужный.
			this.clients.delete(key)
		} else {
			client = new KaitenClient(
				this.config,
				new CredentialsProvider({ apiUrl, apiToken }, this.logger),
				this.logger,
				{ guardUrl: this.guardUrl },
			)

			if (this.clients.size >= this.max) {
				const oldest = this.clients.keys().next().value

				if (oldest !== undefined) this.clients.delete(oldest)
			}
		}

		this.clients.set(key, client)

		return client
	}

	/** Клиент по `authInfo` из токена доступа: там адрес и токен Kaiten, которые человек ввёл при входе. */
	forAuth(auth: AuthInfo | undefined): KaitenClient {
		const token = auth?.extra?.kaitenToken
		const url = auth?.extra?.kaitenUrl ?? this.config.apiUrl

		if (typeof token !== 'string' || !token) throw new Error('Нет учётных данных Kaiten в токене доступа')

		if (typeof url !== 'string' || !url) throw new Error('Не задан Kaiten URL (ни в токене, ни в KAITEN_API_URL)')

		return this.get(normalizeApiUrl(url), token)
	}
}

/**
 * Вход по API-токену Kaiten. Токен сразу проверяется запросом текущего пользователя,
 * чтобы опечатка всплыла на форме, а не первой ошибкой в чате.
 */
export function kaitenLogin(config: Config, logger: Logger, guardUrl?: UrlGuard): Login {
	// Подписи и подсказки -- на странице `src/frontend/pages/_login.svelte`, здесь имена
	// полей и подписи для текста ошибки. Адрес с KAITEN_API_URL не спрашиваем.
	const fields = [
		...(config.apiUrl ? [] : [{ name: 'kaiten_url', label: { ru: 'Адрес Kaiten', en: 'Kaiten address' } }]),
		{ name: 'kaiten_token', label: { ru: 'API-токен Kaiten', en: 'Kaiten API token' } },
	]

	const login = tokenFormLogin({
		fields,
		async verify(values) {
			const apiUrl = normalizeApiUrl(config.apiUrl ?? values.kaiten_url ?? '')
			const apiToken = values.kaiten_token ?? ''
			const host = parseHost(apiUrl)
			let user

			try {
				// Свой клиент, не из кэша: неверные токены не должны вытеснять рабочих.
				const credentials = new CredentialsProvider({ apiUrl, apiToken }, logger)
				const client = new KaitenClient(config, credentials, logger, { guardUrl })

				user = await client.getCurrentUser()
			} catch (error) {
				throw loginError(error, host, logger)
			}

			return {
				subject: `${host}:${user.id}`,
				claims: { kaitenUrl: apiUrl, kaitenToken: apiToken },
			}
		},
	})

	// Статическая страница входа не знает про KAITEN_API_URL,
	// подсказываем ей через фрагмент.
	return config.apiUrl ? { ...login, context: { kaitenUrl: 'fixed' } } : login
}

/** Хост из введённого адреса. С мусором человек вернётся на форму до запроса. */
function parseHost(apiUrl: string): string {
	try {
		const url = new URL(apiUrl)

		if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.host
	} catch {
		// Ниже тот же ответ, что и для непонятной схемы.
	}

	throw new LoginError({ ru: 'Это не похоже на адрес Kaiten', en: 'This does not look like a Kaiten address' })
}

/** Текст для формы по ошибке входа. Непонятные случаи уходят в лог как есть. */
function loginError(error: unknown, host: string, logger: Logger): LoginError {
	if (error instanceof UnsafeUrlError) return new LoginError({ ru: error.message, en: error.en })

	const status = error instanceof KaitenApiError ? error.status : undefined

	if (status === 401 || status === 403)
		return new LoginError({
			ru: 'Kaiten не узнал этот токен, проверь его и адрес',
			en: 'Kaiten did not recognize this token, check it and the address',
		})

	if (status === 404)
		return new LoginError({
			ru: `По адресу ${host} нет Kaiten API, проверь адрес`,
			en: `There is no Kaiten API at ${host}, check the address`,
		})

	logger.warn('Kaiten login check failed', {
		host,
		status,
		message: error instanceof Error ? error.message : String(error),
	})

	if (status !== undefined && status >= 300 && status < 400) {
		return new LoginError({
			ru: `${host} отвечает редиректом, укажи адрес, который открываешь в браузере`,
			en: `${host} answers with a redirect, enter the address you open in the browser`,
		})
	}

	return new LoginError({
		ru: `Не получилось достучаться до Kaiten по адресу ${host}.`,
		en: `Could not reach Kaiten at ${host}.`,
	})
}

export type HostedOptions = {
	config: Config
	logger: Logger
	http: HttpConfig
	store: AuthStore
	/** Проверка адреса из формы. Тестам с Kaiten на 127.0.0.1 нужна своя. */
	guardUrl?: UrlGuard
	/** Собранные страницы. Тестам без `astro build` хватает `fakePages()`. */
	publicDir?: string
}

/** Опции удалённого коннектора. Отдельно от запуска, чтобы тесты подняли его на своём порту. */
export function hostedOptions({
	config,
	logger,
	http,
	store,
	guardUrl = publicUrlGuard(),
	publicDir = PUBLIC_DIR,
}: HostedOptions): HttpAppOptions {
	// С KAITEN_API_URL адрес задал админ, а не посетитель формы: проверять нечего.
	const guard = config.apiUrl ? undefined : guardUrl
	const cache = new ClientCache(config, logger, { guardUrl: guard })

	return {
		config: http,
		service: { name: 'kaiten' },
		publicDir,
		// Токен Kaiten едет в claims, поэтому токены доступа шифруются, а не только подписываются.
		auth: { login: kaitenLogin(config, logger, guard), store, tokens: 'encrypt' },
		createServer: (auth) => createServer({ config, logger, resolveClient: () => cache.forAuth(auth) }),
	}
}

/**
 * `serve --http`. Клиенты OAuth лежат в SQLite на томе: Claude регистрируется один раз,
 * и после деплоя с пустым хранилищем людям пришлось бы подключаться заново.
 */
export async function serveHosted(config: Config, logger: Logger, env: Env = process.env): Promise<void> {
	const store = sqliteStore(join(dataDir(NAME, env), 'auth.db'))

	await serveHttp(hostedOptions({ config, logger, http: loadHttpConfig(env), store }))
}
