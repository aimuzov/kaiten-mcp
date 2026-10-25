import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, mock, test } from 'node:test'
import { createLogger } from '@aimuzov/infra-mcp-kit'
import { createHttpApp, sqliteStore } from '@aimuzov/infra-mcp-kit/http'
import { connectHttp, fakePages, startHttp, type RunningHttp } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from './config.ts'
import { hostedOptions } from './http.ts'

// auth.db и токены выпустил кит 2.1.0, на котором коннектор жил до 3.0. Kaiten шифрует токены,
// поэтому нужен режим encrypt: живые подключения должны пережить выкатку без нового входа.
const fixtures = join(import.meta.dirname, 'testing/fixtures')
const fixture = JSON.parse(readFileSync(join(fixtures, 'tokens-2.1.json'), 'utf8')) as {
	secret: string
	issuer: string
	createdAt: number
	modes: { encrypt: { clientId: string; access_token: string; refresh_token: string } }
}
const issued = fixture.modes.encrypt
const config: Config = { requestTimeoutMs: 5000, maxConcurrentRequests: 5, logLevel: 'error' }
const quiet = createLogger({ level: 'error', write: () => {} })
let running: RunningHttp | undefined

after(async () => {
	await running?.close()
	mock.restoreAll()
})

test('auth.db и токены кита 2.1 работают на 3.0: доступ, refresh и отказ повтору', async () => {
	// Токены выпущены в момент createdAt: часы ставим на минуту позже, пока access ещё жив.
	mock.method(Date, 'now', () => fixture.createdAt + 60_000)

	const db = join(mkdtempSync(join(tmpdir(), 'kaiten-compat-')), 'auth.db')

	copyFileSync(join(fixtures, 'auth-2.1.db'), db)

	running = await startHttp(() =>
		createHttpApp(
			hostedOptions({
				config,
				logger: quiet,
				http: {
					port: 0,
					publicUrl: new URL(fixture.issuer),
					authSecret: fixture.secret,
					allowedRedirectUris: [],
				},
				store: sqliteStore(db),
				guardUrl: async () => {},
				publicDir: fakePages(),
			}),
		),
	)

	const client = await connectHttp(running.base, issued.access_token)

	assert.ok((await client.listTools()).tools.length > 0, 'старый access-токен пускает к инструментам')
	await client.close()

	const refresh = (token: string) =>
		fetch(`${running!.base}/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: token,
				client_id: issued.clientId,
			}),
		})

	const fresh = await refresh(issued.refresh_token)

	assert.equal(fresh.status, 200, 'старый refresh-токен меняется на новую пару')

	const tokens = (await fresh.json()) as { access_token: string; refresh_token: string }

	assert.ok(tokens.access_token && tokens.refresh_token)
	assert.equal((await refresh(issued.refresh_token)).status, 400, 'потраченный refresh второй раз не работает')
})
