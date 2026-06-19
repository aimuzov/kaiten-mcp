import { appendFileSync } from 'node:fs'

/**
 * Логирование для MCP-сервера.
 *
 * ВАЖНО: stdout зарезервирован под JSON-RPC сообщения протокола MCP.
 * Любой посторонний вывод в stdout ломает протокол, поэтому все логи
 * идут в stderr и (опционально) в файл.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

const LEVEL_ORDER: Record<LogLevel, number> = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
}

export interface LoggerOptions {
	level: LogLevel
	filePath?: string
}

export class Logger {
	private level: LogLevel
	private filePath?: string

	constructor(options: LoggerOptions) {
		this.level = options.level
		this.filePath = options.filePath
	}

	private shouldLog(level: LogLevel): boolean {
		return LEVEL_ORDER[level] <= LEVEL_ORDER[this.level]
	}

	private write(level: LogLevel, message: string, meta?: unknown): void {
		if (!this.shouldLog(level)) return

		const timestamp = new Date().toISOString()
		const metaStr = meta === undefined ? '' : ' ' + safeStringify(meta)
		const line = `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`

		// stderr — безопасно, не мешает JSON-RPC в stdout.
		process.stderr.write(line + '\n')

		if (this.filePath) {
			try {
				appendFileSync(this.filePath, line + '\n')
			} catch {
				// Не падаем из-за проблем с файлом лога.
			}
		}
	}

	error(message: string, meta?: unknown): void {
		this.write('error', message, meta)
	}

	warn(message: string, meta?: unknown): void {
		this.write('warn', message, meta)
	}

	info(message: string, meta?: unknown): void {
		this.write('info', message, meta)
	}

	debug(message: string, meta?: unknown): void {
		this.write('debug', message, meta)
	}
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}
