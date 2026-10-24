import type { Logger } from '@aimuzov/infra-mcp-kit'

import type { Config } from './config.ts'
import type { CredentialsProvider } from './credentials.ts'
import type { KaitenBoard, KaitenCard, KaitenColumn, KaitenLane, KaitenSpace, KaitenUser } from './types.ts'

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type Params = Record<string, unknown>

export type RequestOptions = {
	params?: Params
	data?: unknown
}

/** Ошибка Kaiten API с сообщением, которое можно показать модели. */
export class KaitenApiError extends Error {
	readonly status?: number
	readonly details?: unknown

	constructor(message: string, status?: number, details?: unknown) {
		super(message)
		this.name = 'KaitenApiError'
		this.status = status
		this.details = details
	}
}

/** Ограничивает число одновременных запросов: Kaiten режет частые обращения с одного токена. */
class Semaphore {
	private available: number
	private queue: (() => void)[] = []

	constructor(max: number) {
		this.available = max
	}

	async acquire(): Promise<() => void> {
		if (this.available > 0) {
			this.available -= 1

			return () => this.release()
		}

		return new Promise((resolve) => {
			this.queue.push(() => {
				this.available -= 1
				resolve(() => this.release())
			})
		})
	}

	private release(): void {
		this.available += 1
		this.queue.shift()?.()
	}
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Query как его ждёт Kaiten: незаданные и null параметры не уходят вовсе,
 * списки сервер принимает строкой через запятую, её собирают инструменты.
 */
export function toQuery(params: Params = {}): string {
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) query.set(key, String(value))
	}

	const text = query.toString()

	return text ? `?${text}` : ''
}

/** Пауза перед повтором: `Retry-After` в секундах, иначе экспонента до 5 секунд. */
export function retryDelay(retryAfter: string | null, attempt: number): number {
	const fromHeader = retryAfter === null ? Number.NaN : Number.parseFloat(retryAfter) * 1000

	return Number.isFinite(fromHeader) ? fromHeader : Math.min(2 ** attempt * 250, 5000)
}

export class KaitenClient {
	private readonly semaphore: Semaphore
	private readonly logger: Logger
	private readonly credentials: CredentialsProvider
	private readonly timeoutMs: number

	constructor(config: Config, credentials: CredentialsProvider, logger: Logger) {
		this.logger = logger
		this.credentials = credentials
		this.timeoutMs = config.requestTimeoutMs
		this.semaphore = new Semaphore(config.maxConcurrentRequests)
	}

	/** Запрос с повторами на 429 и 5xx и с ограничением одновременных запросов. */
	async request<T = unknown>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
		// Креды берём до слота семафора: пока человек вводит их в диалоге, пул не должен стоять.
		const { apiUrl, apiToken } = await this.credentials.get()
		const release = await this.semaphore.acquire()
		const url = `${apiUrl}${path}${toQuery(options.params)}`

		try {
			for (let attempt = 0; ; attempt++) {
				this.logger.debug('Kaiten request', { method, path, params: options.params })

				let response: Response

				try {
					response = await fetch(url, {
						method,
						headers: {
							Authorization: `Bearer ${apiToken}`,
							Accept: 'application/json',
							...(options.data === undefined ? {} : { 'Content-Type': 'application/json' }),
						},
						body: options.data === undefined ? undefined : JSON.stringify(options.data),
						signal: AbortSignal.timeout(this.timeoutMs),
					})
				} catch (error) {
					throw this.networkError(error, method, path)
				}

				if (response.ok) return (await readBody(response)) as T

				if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
					const delay = retryDelay(response.headers.get('retry-after'), attempt + 1)

					this.logger.warn('Kaiten request retry', {
						method,
						path,
						status: response.status,
						attempt: attempt + 1,
						delay,
					})

					await response.body?.cancel()
					await sleep(delay)

					continue
				}

				throw this.apiError(response.status, await readBody(response), method, path)
			}
		} finally {
			release()
		}
	}

	private apiError(status: number, data: unknown, method: Method, path: string): KaitenApiError {
		let message = `Kaiten API ${method} ${path} failed (HTTP ${status})`

		if (data && typeof data === 'object') {
			const detail = (data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error

			if (typeof detail === 'string') message += `: ${detail}`
		} else if (typeof data === 'string' && data && data.length < 500) {
			message += `: ${data}`
		}

		this.logger.error('Kaiten request failed', { method, path, status })

		return new KaitenApiError(message, status, data)
	}

	private networkError(error: unknown, method: Method, path: string): KaitenApiError {
		const timeout = error instanceof DOMException && error.name === 'TimeoutError'
		const reason = timeout ? 'таймаут запроса' : error instanceof Error ? error.message : String(error)

		this.logger.error('Kaiten request failed', { method, path, reason })

		return new KaitenApiError(`Kaiten API ${method} ${path} failed: ${reason}`)
	}

	get<T = unknown>(path: string, params?: Params): Promise<T> {
		return this.request<T>('GET', path, { params })
	}

	post<T = unknown>(path: string, data?: unknown, params?: Params): Promise<T> {
		return this.request<T>('POST', path, { data, params })
	}

	patch<T = unknown>(path: string, data?: unknown): Promise<T> {
		return this.request<T>('PATCH', path, { data })
	}

	put<T = unknown>(path: string, data?: unknown): Promise<T> {
		return this.request<T>('PUT', path, { data })
	}

	delete<T = unknown>(path: string): Promise<T> {
		return this.request<T>('DELETE', path)
	}

	getCurrentUser(): Promise<KaitenUser> {
		return this.get<KaitenUser>('/users/current')
	}

	listUsers(params?: Params): Promise<KaitenUser[]> {
		return this.get<KaitenUser[]>('/users', params)
	}

	listSpaces(params?: Params): Promise<KaitenSpace[]> {
		return this.get<KaitenSpace[]>('/spaces', params)
	}

	getSpace(spaceId: number): Promise<KaitenSpace> {
		return this.get<KaitenSpace>(`/spaces/${spaceId}`)
	}

	listBoards(spaceId: number): Promise<KaitenBoard[]> {
		return this.get<KaitenBoard[]>(`/spaces/${spaceId}/boards`)
	}

	getBoard(boardId: number): Promise<KaitenBoard> {
		return this.get<KaitenBoard>(`/boards/${boardId}`)
	}

	listColumns(boardId: number): Promise<KaitenColumn[]> {
		return this.get<KaitenColumn[]>(`/boards/${boardId}/columns`)
	}

	listLanes(boardId: number): Promise<KaitenLane[]> {
		return this.get<KaitenLane[]>(`/boards/${boardId}/lanes`)
	}

	listCards(params?: Params): Promise<KaitenCard[]> {
		return this.get<KaitenCard[]>('/cards', params)
	}

	getCard(cardId: number): Promise<KaitenCard> {
		return this.get<KaitenCard>(`/cards/${cardId}`)
	}
}

/** JSON, если он есть; пустой ответ (DELETE) даёт null, не-JSON -- текст как есть. */
async function readBody(response: Response): Promise<unknown> {
	const body = await response.text()

	if (!body) return null

	try {
		return JSON.parse(body)
	} catch {
		return body
	}
}
