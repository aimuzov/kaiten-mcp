import type { Logger } from '@aimuzov/infra-mcp-kit'

import { normalizeApiUrl, redactToken } from './config.ts'

export type Credentials = {
	apiUrl: string
	apiToken: string
}

/** Что именно нужно спросить у пользователя. */
export type CredentialNeed = {
	url: boolean
	token: boolean
}

/**
 * Интерактивный запрос кредов через MCP elicitation. Null, если пользователь отказался
 * или клиент elicitation не умеет.
 */
export type CredentialElicitor = (need: CredentialNeed) => Promise<{ api_url?: string; api_token?: string } | null>

const MISSING_MESSAGE =
	'Не заданы учётные данные Kaiten. Укажите KAITEN_API_URL и KAITEN_API_TOKEN ' +
	'(в .env или в конфиге MCP-сервера), либо используйте клиент с поддержкой ' +
	'интерактивного запроса (elicitation), чтобы ввести их при обращении.'

/**
 * Креды Kaiten с ленивым запросом недостающих. Введённое живёт в памяти процесса
 * и на диск не пишется.
 */
export class CredentialsProvider {
	private apiUrl?: string
	private apiToken?: string
	private elicitor?: CredentialElicitor
	private pending?: Promise<void>
	private readonly logger: Logger

	constructor(initial: { apiUrl?: string; apiToken?: string }, logger: Logger) {
		this.apiUrl = initial.apiUrl
		this.apiToken = initial.apiToken
		this.logger = logger
	}

	/** Подключить запрос: сервер, через который спрашивать, появляется позже провайдера. */
	setElicitor(elicitor: CredentialElicitor): void {
		this.elicitor = elicitor
	}

	get hasCredentials(): boolean {
		return Boolean(this.apiUrl && this.apiToken)
	}

	/** Креды, при нужде спросив недостающие. Параллельные вызовы ждут один и тот же вопрос. */
	async get(): Promise<Credentials> {
		if (this.apiUrl && this.apiToken) return { apiUrl: this.apiUrl, apiToken: this.apiToken }

		if (this.elicitor) {
			this.pending ??= this.elicitOnce().finally(() => {
				this.pending = undefined
			})

			await this.pending
		}

		if (this.apiUrl && this.apiToken) return { apiUrl: this.apiUrl, apiToken: this.apiToken }

		throw new Error(MISSING_MESSAGE)
	}

	private async elicitOnce(): Promise<void> {
		if (!this.elicitor) return

		const need: CredentialNeed = { url: !this.apiUrl, token: !this.apiToken }

		this.logger.info('Запрашиваю учётные данные Kaiten у пользователя (elicitation)', need)

		const result = await this.elicitor(need)

		if (!result) {
			this.logger.warn('Интерактивный запрос кредов не дал результата (отказ или нет поддержки)')

			return
		}

		if (result.api_url?.trim()) this.apiUrl = normalizeApiUrl(result.api_url)

		if (result.api_token?.trim()) this.apiToken = result.api_token.trim()

		if (this.apiUrl && this.apiToken) {
			this.logger.info('Учётные данные Kaiten получены', {
				apiUrl: this.apiUrl,
				token: redactToken(this.apiToken),
			})
		}
	}
}
