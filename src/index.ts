#!/usr/bin/env node
import { createLogger, loadEnvFile, runCli } from '@aimuzov/infra-mcp-kit'

import { loadConfig } from './config.ts'
import { CredentialsProvider } from './credentials.ts'
import { serveHosted } from './http.ts'
import { createStdioServer, NAME, VERSION } from './server.ts'

const USAGE = `Usage: kaiten-mcp [serve [--http] | --help | --version]

  serve           MCP-сервер на stdio (по умолчанию)
  serve --http    удалённый коннектор с OAuth: человек входит своим API-токеном Kaiten

Переменные окружения:
  KAITEN_API_URL                  адрес Kaiten, /api/latest можно не писать. В HTTP-режиме
                                  задаёт один адрес для всех, иначе его вводят при входе
  KAITEN_API_TOKEN                API-токен для stdio; без него сервер спросит через elicitation
  KAITEN_DEFAULT_SPACE_ID         пространство по умолчанию
  KAITEN_REQUEST_TIMEOUT_MS       тайм-аут запроса к Kaiten, 30000
  KAITEN_MAX_CONCURRENT_REQUESTS  одновременных запросов на токен, 1-20, по умолчанию 5
  KAITEN_LOG_LEVEL                error | warn | info | debug, по умолчанию info
  KAITEN_LOG_FILE                 файл лога сверх stderr

Для serve --http:
  PUBLIC_URL             публичный адрес коннектора
  AUTH_SECRET            ключ шифрования токенов, от 32 символов
  PORT                   порт, 8080
  KAITEN_MCP_DATA_DIR    каталог с auth.db, по умолчанию ~/.config/kaiten-mcp
  ALLOWED_REDIRECT_URIS  колбэки сверх Claude и loopback, через запятую`

// .env рядом с запуском; переменные из конфига MCP-клиента главнее.
loadEnvFile()

const config = loadConfig()
const logger = createLogger({ level: config.logLevel, file: config.logFile })

await runCli({
	name: NAME,
	version: VERSION,
	usage: USAGE,
	stdio: () =>
		createStdioServer(
			config,
			new CredentialsProvider({ apiUrl: config.apiUrl, apiToken: config.apiToken }, logger),
			logger,
		),
	http: () => serveHosted(config, logger),
})
