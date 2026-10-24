import { join } from 'node:path'
import { dataDir, type Env, type Logger } from '@aimuzov/infra-mcp-kit'
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
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'

import { normalizeApiUrl, type Config } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { KaitenApiError, KaitenClient } from './kaiten-client.ts'
import { createServer, NAME } from './server.ts'

export const SERVICE = {
	name: 'kaiten',
	repo: 'https://github.com/aimuzov/kaiten-mcp',
	accent: { light: '#e8590c', dark: '#ff8a4c' },
}

const TAGLINE = 'Карточки, доски и планирование дня Kaiten прямо из Claude'

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

	constructor(config: Config, logger: Logger, max = 500) {
		this.config = config
		this.logger = logger
		this.max = max
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
export function kaitenLogin(config: Config, logger: Logger): Login {
	const fields = [
		...(config.apiUrl
			? []
			: [
					{
						name: 'kaiten_url',
						label: 'Адрес Kaiten',
						type: 'url' as const,
						placeholder: 'https://your-domain.kaiten.ru',
						help: 'Тот, что открываешь в браузере.',
					},
				]),
		{
			name: 'kaiten_token',
			label: 'API-токен Kaiten',
			type: 'password' as const,
			help: 'Профиль → API-ключи → Создать',
		},
	]

	return tokenFormLogin({
		title: 'Подключение к Kaiten',
		lead: 'Токен нужен только для твоих запросов. Он шифруется в токен доступа и на сервере не хранится.',
		fields,
		submit: 'Подключить',
		async verify(values) {
			const apiUrl = normalizeApiUrl(config.apiUrl ?? values.kaiten_url ?? '')
			const apiToken = values.kaiten_token ?? ''
			let user

			try {
				// Свой клиент, не из кэша: неверные токены не должны вытеснять рабочих.
				const client = new KaitenClient(config, new CredentialsProvider({ apiUrl, apiToken }, logger), logger)

				user = await client.getCurrentUser()
			} catch (error) {
				if (error instanceof KaitenApiError && (error.status === 401 || error.status === 403)) {
					throw new LoginError('Kaiten не узнал этот токен, проверь его и адрес')
				}

				throw new LoginError(`Не получилось достучаться до Kaiten по адресу ${new URL(apiUrl).host}.`)
			}

			return {
				subject: `${new URL(apiUrl).host}:${user.id}`,
				claims: { kaitenUrl: apiUrl, kaitenToken: apiToken },
			}
		},
	})
}

export type HostedOptions = {
	config: Config
	logger: Logger
	http: HttpConfig
	store: AuthStore
}

/** Опции удалённого коннектора. Отдельно от запуска, чтобы тесты подняли его на своём порту. */
export function hostedOptions({ config, logger, http, store }: HostedOptions): HttpAppOptions {
	const cache = new ClientCache(config, logger)

	return {
		config: http,
		service: SERVICE,
		// Токен Kaiten едет в claims, поэтому токены доступа шифруются, а не только подписываются.
		auth: { login: kaitenLogin(config, logger), store, tokens: 'encrypt' },
		landing: {
			tagline: TAGLINE,
			lead: 'Добавь адрес коннектора в Claude и войди своим API-токеном Kaiten.',
			tools: ['Карточки и доски', 'Комментарии и чек-листы', 'Учёт времени', 'План на день'],
		},
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
